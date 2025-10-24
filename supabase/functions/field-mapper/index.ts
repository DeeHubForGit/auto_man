// Helper: detectFieldMappings(events)
// - Scans a batch of Google Calendar event objects and guesses which extendedProperties
//   keys / description labels correspond to the canonical fields we care about:
//   first_name, last_name (or full name), email, mobile, pickup.
// - Returns a mapping object with candidate key names + confidence scores.
// - This is intentionally deterministic and conservative: it only returns mappings
//   when a candidate clearly looks like the requested field.
//
// Usage (inside your gcal-sync):
//   import { detectFieldMappings } from './field-mapper';
//   const mapping = detectFieldMappings(events); // events = eventsData.items
//   // mapping example:
//   // {
//   //   first_name: { key: 'first_name', source: 'extended.private', score: 0.92 },
//   //   email:      { key: 'email', source: 'extended.shared', score: 0.99 },
//   //   pickup:     { key: 'Pickup Address', source: 'description', score: 0.8 },
//   //   mobile:     { key: 'mobile', source: 'extended.private', score: 0.9 }
//   // }
//   // Then pass mapping into your extraction helpers so they prefer mapping.key.

export function detectFieldMappings(events: any[], opts?: { sampleLimit?: number }) {
    const sampleLimit = opts?.sampleLimit ?? 200;
    const samples: Record<string, string[]> = {}; // candidateKey -> samples
    const labelSamples: Record<string, string[]> = {}; // description label -> values
  
    const pushSample = (map: Record<string, string[]>, key: string, value: any) => {
      if (value == null) return;
      const s = String(value).trim();
      if (!s) return;
      if (!map[key]) map[key] = [];
      if (map[key].length < 20) map[key].push(s); // cap per-key samples
    };
  
    // helpers
    const emailRx = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
    const phoneRx = /(\+?\d[\d\-\s\(\)]{6,}\d)/;
    const addressHintRx = /\d+\s+\w+|street|st\.|road|rd\.|ave|avenue|lane|ln\.|drive|dr\./i;
    const nameHintRx = /^[A-Za-z\-' ]{2,}$/;
  
    // Gather candidate keys from extendedProperties and description labels
    let count = 0;
    for (const e of events ?? []) {
      if (count++ >= sampleLimit) break;
  
      // extendedProperties.private and shared
      const epPriv = e.extendedProperties?.private ?? {};
      const epShared = e.extendedProperties?.shared ?? {};
      for (const k of Object.keys(epPriv)) pushSample(samples, `private:${k}`, epPriv[k]);
      for (const k of Object.keys(epShared)) pushSample(samples, `shared:${k}`, epShared[k]);
  
      // location often contains pickup
      if (typeof e.location === 'string' && e.location.trim().length) {
        pushSample(samples, `location`, e.location);
      }
  
      // Try to parse labelled answers in description: lines like "Pickup Address: 123 Foo St"
      if (typeof e.description === 'string' && e.description.trim().length) {
        const lines = e.description.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          // "Label: value" or "Label - value"
          const m = line.match(/^(.{1,60}?)\s*[:\-]\s*(.+)$/);
          if (m) {
            const label = m[1].trim();
            const val = m[2].trim();
            pushSample(labelSamples, label, val);
            pushSample(samples, `desc:${label}`, val);
          }
        }
        // also look for "Questions and answers: Pickup Address: 123..."
        const labelBlockRx = /([A-Za-z0-9 \-]{3,40})\s*[:\-]\s*([^\n\r]{3,200})/g;
        let m;
        // eslint-disable-next-line no-cond-assign
        while ((m = labelBlockRx.exec(e.description)) !== null) {
          const label = m[1].trim();
          const val = m[2].trim();
          pushSample(labelSamples, label, val);
          pushSample(samples, `desc:${label}`, val);
        }
      }
  
      // Attendees: attendee.displayName and attendee.email
      if (Array.isArray(e.attendees)) {
        for (const a of e.attendees.slice(0, 3)) {
          if (a?.displayName) pushSample(samples, 'attendee:displayName', a.displayName);
          if (a?.email) pushSample(samples, 'attendee:email', a.email);
          if (a?.phone) pushSample(samples, 'attendee:phone', a.phone);
        }
      }
  
      // creator/organizer fields
      if (e.creator?.email) pushSample(samples, 'creator:email', e.creator.email);
      if (e.creator?.displayName) pushSample(samples, 'creator:displayName', e.creator.displayName);
      if (e.organizer?.email) pushSample(samples, 'organizer:email', e.organizer.email);
      if (e.organizer?.displayName) pushSample(samples, 'organizer:displayName', e.organizer.displayName);
    }
  
    // Score candidate -> field likelihoods
    type CandidateScore = { key: string; source: string; score: number; samples: string[] };
    const emailCandidates: CandidateScore[] = [];
    const phoneCandidates: CandidateScore[] = [];
    const pickupCandidates: CandidateScore[] = [];
    const nameCandidates: CandidateScore[] = [];
  
    const evaluateValues = (key: string, values: string[]) => {
      let emailMatches = 0;
      let phoneMatches = 0;
      let addressMatches = 0;
      let nameLike = 0;
      for (const v of values) {
        if (emailRx.test(v)) emailMatches++;
        if (phoneRx.test(v)) phoneMatches++;
        if (addressHintRx.test(v) || /,/.test(v)) addressMatches++;
        if (nameHintRx.test(v) && v.split(/\s+/).length <= 4 && !emailRx.test(v) && !phoneRx.test(v)) nameLike++;
      }
      const total = values.length || 1;
      return {
        emailScore: emailMatches / total,
        phoneScore: phoneMatches / total,
        addressScore: addressMatches / total,
        nameScore: nameLike / total,
        samples: values
      };
    };
  
    for (const rawKey of Object.keys(samples)) {
      const values = samples[rawKey];
      const { emailScore, phoneScore, addressScore, nameScore, samples: s } = evaluateValues(rawKey, values);
  
      const source = rawKey.startsWith('private:') ? 'extended.private'
                   : rawKey.startsWith('shared:') ? 'extended.shared'
                   : rawKey.startsWith('desc:') ? 'description'
                   : rawKey === 'location' ? 'location'
                   : rawKey.startsWith('attendee:') ? 'attendee'
                   : rawKey.startsWith('creator:') ? 'creator'
                   : 'unknown';
  
      if (emailScore > 0) emailCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: emailScore, samples: s });
      if (phoneScore > 0) phoneCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: phoneScore, samples: s });
      if (addressScore > 0) pickupCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: addressScore, samples: s });
      if (nameScore > 0) nameCandidates.push({ key: rawKey.replace(/^(private:|shared:|desc:)/, ''), source, score: nameScore, samples: s });
    }
  
    // Also evaluate labelSamples (explicit labels from description)
    for (const label of Object.keys(labelSamples)) {
      const values = labelSamples[label];
      const { emailScore, phoneScore, addressScore, nameScore, samples: s } = evaluateValues(label, values);
      const source = 'description';
      const normalizedLabelKey = label;
      if (emailScore > 0) emailCandidates.push({ key: normalizedLabelKey, source, score: emailScore, samples: s });
      if (phoneScore > 0) phoneCandidates.push({ key: normalizedLabelKey, source, score: phoneScore, samples: s });
      if (addressScore > 0) pickupCandidates.push({ key: normalizedLabelKey, source, score: addressScore, samples: s });
      if (nameScore > 0) nameCandidates.push({ key: normalizedLabelKey, source, score: nameScore, samples: s });
    }
  
    // Candidate selection helper: choose highest scored candidate that exceeds threshold
    const choose = (cands: CandidateScore[], minScore = 0.5) => {
      if (!cands.length) return null;
      cands.sort((a, b) => b.score - a.score);
      const best = cands[0];
      if (best.score >= minScore) return { key: best.key, source: best.source, score: best.score, samples: best.samples };
      return null;
    };
  
    // Try to choose mapping for each field; be conservative (minScore 0.5)
    const chosenEmail = choose(emailCandidates, 0.5);
    const chosenPhone = choose(phoneCandidates, 0.5);
    const chosenPickup = choose(pickupCandidates, 0.4); // pickup/address sometimes noisy, lower threshold
    // For names, prefer explicit first/last keys if present in extended props
    let chosenFirst = null, chosenLast = null, chosenNameFull = null;
    // try direct keys
    const lookFirstKeys = ['first_name','first-name','first name','given_name','givenName','given-name'];
    const lookLastKeys =  ['last_name','last-name','last name','surname','family_name'];
    for (const k of Object.keys(samples)) {
      const simple = k.replace(/^(private:|shared:|desc:)/,'');
      if (!chosenFirst && lookFirstKeys.includes(simple) && samples[k].length) {
        const ev = evaluateValues(k, samples[k]);
        if (ev.nameScore > 0) chosenFirst = { key: simple, source: k.startsWith('private:') ? 'extended.private' : k.startsWith('shared:') ? 'extended.shared' : 'description', score: ev.nameScore, samples: samples[k] };
      }
      if (!chosenLast && lookLastKeys.includes(simple) && samples[k].length) {
        const ev = evaluateValues(k, samples[k]);
        if (ev.nameScore > 0) chosenLast = { key: simple, source: k.startsWith('private:') ? 'extended.private' : k.startsWith('shared:') ? 'extended.shared' : 'description', score: ev.nameScore, samples: samples[k] };
      }
    }
    if (!chosenFirst && nameCandidates.length) {
      const bestName = choose(nameCandidates, 0.5);
      if (bestName) {
        // bestName.key may be a full name label; use as full-name mapping
        chosenNameFull = { key: bestName.key, source: bestName.source, score: bestName.score, samples: bestName.samples };
      }
    }
  
    // Build final mapping object
    const mapping: Record<string, { key: string | null, source: string | null, score: number | null, examples?: string[] }> = {
      first_name: chosenFirst ? { key: chosenFirst.key, source: chosenFirst.source, score: chosenFirst.score, examples: chosenFirst.samples } : (chosenNameFull ? { key: chosenNameFull.key, source: chosenNameFull.source, score: chosenNameFull.score, examples: chosenNameFull.samples } : { key: null, source: null, score: null }),
      last_name: chosenLast ? { key: chosenLast.key, source: chosenLast.source, score: chosenLast.score, examples: chosenLast.samples } : (chosenNameFull ? { key: chosenNameFull.key, source: chosenNameFull.source, score: chosenNameFull.score, examples: chosenNameFull.samples } : { key: null, source: null, score: null }),
      email: chosenEmail ? { key: chosenEmail.key, source: chosenEmail.source, score: chosenEmail.score, examples: chosenEmail.samples } : { key: null, source: null, score: null },
      mobile: chosenPhone ? { key: chosenPhone.key, source: chosenPhone.source, score: chosenPhone.score, examples: chosenPhone.samples } : { key: null, source: null, score: null },
      pickup: chosenPickup ? { key: chosenPickup.key, source: chosenPickup.source, score: chosenPickup.score, examples: chosenPickup.samples } : { key: null, source: null, score: null }
    };
  
    return { mapping, candidates: { emailCandidates, phoneCandidates, pickupCandidates, nameCandidates }, rawSamples: samples };
  }
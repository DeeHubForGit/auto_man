from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import json, os

SCOPES = ["https://www.googleapis.com/auth/calendar"]

def creds():
    if os.path.exists("token.json"):
        return Credentials.from_authorized_user_file("token.json", SCOPES)
    flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
    c = flow.run_local_server(port=0)   # opens browser
    open("token.json","w").write(c.to_json())
    return c

service = build("calendar", "v3", credentials=creds())
cals = service.calendarList().list().execute()["items"]
print(json.dumps([{ "summary": c["summary"], "id": c["id"] } for c in cals], indent=2))

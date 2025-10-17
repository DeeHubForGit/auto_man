// Professional Modal Dialog Component
(function() {
  'use strict';

  // Create modal HTML structure
  function createModal() {
    const modalHTML = `
      <div id="customModal" class="fixed inset-0 z-[9999] hidden items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all">
          <div class="p-6">
            <div class="flex items-start gap-4">
              <div id="modalIcon" class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl">
                <!-- Icon will be inserted here -->
              </div>
              <div class="flex-1 min-w-0">
                <h3 id="modalTitle" class="text-lg font-semibold text-gray-900 mb-2"></h3>
                <p id="modalMessage" class="text-sm text-gray-600 leading-relaxed"></p>
              </div>
            </div>
            <div class="mt-6 flex gap-3 justify-end">
              <button id="modalCancelBtn" class="hidden px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button id="modalOkBtn" class="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Insert modal into body if it doesn't exist
    if (!document.getElementById('customModal')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
  }

  // Show modal with options
  function showModal(options) {
    const {
      title = 'Notification',
      message = '',
      type = 'info', // 'success', 'error', 'warning', 'info', 'confirm'
      confirmText = 'OK',
      cancelText = 'Cancel',
      onConfirm = null,
      onCancel = null
    } = options;

    createModal();

    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');
    const okBtn = document.getElementById('modalOkBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    // Set content
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    // Set icon and colors based on type
    const iconConfig = {
      success: { icon: '✓', bg: 'bg-green-100', text: 'text-green-600' },
      error: { icon: '✕', bg: 'bg-red-100', text: 'text-red-600' },
      warning: { icon: '⚠', bg: 'bg-yellow-100', text: 'text-yellow-600' },
      info: { icon: 'ℹ', bg: 'bg-blue-100', text: 'text-blue-600' },
      confirm: { icon: '?', bg: 'bg-blue-100', text: 'text-blue-600' }
    };

    const config = iconConfig[type] || iconConfig.info;
    modalIcon.innerHTML = config.icon;
    modalIcon.className = `flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl ${config.bg} ${config.text}`;

    // Show/hide cancel button for confirm dialogs
    if (type === 'confirm') {
      cancelBtn.classList.remove('hidden');
    } else {
      cancelBtn.classList.add('hidden');
    }

    // Show modal with animation
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
      modal.querySelector('.bg-white').classList.add('scale-100', 'opacity-100');
    }, 10);

    // Handle button clicks
    function handleConfirm() {
      closeModal();
      if (onConfirm) onConfirm();
    }

    function handleCancel() {
      closeModal();
      if (onCancel) onCancel();
    }

    function closeModal() {
      modal.classList.remove('flex');
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackdropClick);
    }

    function handleBackdropClick(e) {
      if (e.target === modal) {
        if (type === 'confirm' && onCancel) {
          handleCancel();
        } else {
          closeModal();
        }
      }
    }

    // Attach event listeners
    okBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdropClick);

    // Handle escape key
    function handleEscape(e) {
      if (e.key === 'Escape') {
        if (type === 'confirm' && onCancel) {
          handleCancel();
        } else {
          closeModal();
        }
        document.removeEventListener('keydown', handleEscape);
      }
    }
    document.addEventListener('keydown', handleEscape);
  }

  // Convenience methods
  window.Modal = {
    show: showModal,
    
    success: function(message, title = 'Success') {
      showModal({ type: 'success', title, message });
    },
    
    error: function(message, title = 'Error') {
      showModal({ type: 'error', title, message });
    },
    
    warning: function(message, title = 'Warning') {
      showModal({ type: 'warning', title, message });
    },
    
    info: function(message, title = 'Information') {
      showModal({ type: 'info', title, message });
    },
    
    confirm: function(message, onConfirm, onCancel, title = 'Confirm') {
      showModal({ 
        type: 'confirm', 
        title, 
        message, 
        onConfirm, 
        onCancel,
        confirmText: 'Confirm',
        cancelText: 'Cancel'
      });
    }
  };
})();

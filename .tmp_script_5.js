
        // =============================================================================
        // CRITICAL: Initialize loading state
        // =============================================================================
        window.functionsLoaded = false;
        
        // Update loading status
        setTimeout(() => {
            const status = document.getElementById('loadingStatus');
            if (status) status.textContent = 'Loading functions (40,000+ lines)...';
        }, 100);
        
        // =============================================================================
        // STAFF SERVICES CONTEXTS - Defined early to prevent "before initialization" errors
        // =============================================================================
        const STAFF_SERVICES_CONTEXTS = {};
        let activeStaffContext = 'branch';

        function registerStaffServicesContext(contextKey, config = {}) {
            if (!contextKey) return;
            STAFF_SERVICES_CONTEXTS[contextKey] = {
                leaveStatusId: config.leaveStatusId || null,
                cashStatusId: config.cashStatusId || null
            };
        }
        
        // Make function globally available immediately
        window.registerStaffServicesContext = registerStaffServicesContext;
        window.STAFF_SERVICES_CONTEXTS = STAFF_SERVICES_CONTEXTS;

        function getStaffStatusElement(contextKey, type) {
            const context = STAFF_SERVICES_CONTEXTS[contextKey] || {};
            const fallbackId = type === 'leave' ? 'myLeaveStatus' : 'myCashStatus';
            const targetId = type === 'leave' ? context.leaveStatusId : context.cashStatusId;
            return document.getElementById(targetId || fallbackId);
        }
        
        // =============================================================================
        
        // Legacy openPortalLogin function - now redirects to showLogin for backward compatibility
        // This function is deprecated but kept for any legacy code that might still reference it
        function openPortalLogin(portalKey) {
            // Map legacy portal names
            if (portalKey === 'frontdesk' || portalKey === 'branch') {
                portalKey = 'dispenser';
            }
            
            // Use the modern showLogin function
            if (typeof showLogin === 'function') {
                showLogin(portalKey);
            } else {
            }
        }
        
        // Also attach to window for explicit access (for backward compatibility)
        window.openPortalLogin = openPortalLogin;
        
        // Define openLoginModal early to ensure it's available when openPortalLogin is called
        // This is a safe version that works even if DOM elements aren't ready yet
        function openLoginModal(portal) {
            // Guard: Do not open login modal if user is already authenticated
            if (window.currentUser || (typeof currentUser !== 'undefined' && currentUser)) {
                return;
            }
            
            // Guard: Prevent duplicate calls if modal is already open
            const existingModal = document.getElementById('loginModal');
            if (existingModal) {
                const modalDisplay = existingModal.style.display;
                const computedDisplay = getComputedStyle(existingModal).display;
                const isModalOpen = (modalDisplay !== 'none' && computedDisplay !== 'none') || 
                                  modalDisplay === 'flex' || computedDisplay === 'flex' ||
                                  modalDisplay === 'block' || computedDisplay === 'block';
                
                if (isModalOpen) {
                    return;
                }
            }
            
            // Wait for DOM to be ready if needed
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    // Guard: Check again if user is authenticated before opening modal
                    if (window.currentUser || (typeof currentUser !== 'undefined' && currentUser)) {
                        return;
                    }
                    openLoginModal(portal);
                });
                return;
            }
            
            // Set current portal
            if (typeof currentPortal !== 'undefined') {
                currentPortal = portal;
            }
            window.currentPortal = portal;
            
            // Get portal label helper
            const PORTAL_LABELS = {
                frontdesk: 'Front Desk',
                consultant: 'Consultant',
                dispenser: 'Branch',
                admin: 'Admin',
                finance: 'Finance',
                stock: 'Stock',
                mis: 'MIS',
                gm: 'General Manager',
                director: 'Director',
                'hr-portal': 'HR',
                client: 'Client'
            };
            
            function getPortalLabel(portal) {
                if (!portal) return 'Portal';
                return PORTAL_LABELS[portal] || portal.charAt(0).toUpperCase() + portal.slice(1);
            }
            
            const label = getPortalLabel(portal);
            
            // Try to get DOM elements (may not be available yet)
            const loginModal = document.getElementById('loginModal');
            const modalTitle = document.getElementById('loginModalTitle');
            const modalDescription = document.getElementById('loginModalDescription');
            const loginError = document.getElementById('loginError');
            const loginForm = document.getElementById('loginForm');
            const usernameField = document.getElementById('username') || document.getElementById('loginUsername') || document.getElementById('warehouseUsername') || document.getElementById('unifiedUsername');
            const passwordField = document.getElementById('password') || document.getElementById('loginPassword') || document.getElementById('warehousePassword') || document.getElementById('unifiedPassword');
            
            // Debug: Log what we found
            
            if (!loginModal) {
                // If modal not available yet, retry after a short delay (max 10 retries)
                if (!openLoginModal.retryCount) openLoginModal.retryCount = 0;
                if (openLoginModal.retryCount < 10) {
                    openLoginModal.retryCount++;
                    setTimeout(() => {
                        // Guard: Check again if user is authenticated before retrying
                        if (window.currentUser || (typeof currentUser !== 'undefined' && currentUser)) {
                            return;
                        }
                        openLoginModal(portal);
                    }, 100);
                    return;
                } else {
                    console.error('Login modal not found after 10 retries');
                    alert('Login modal not found. Please refresh the page.');
                    return;
                }
            }
            
            // Reset retry count on success
            openLoginModal.retryCount = 0;
            
            // Ensure modal is in body (not hidden in a collapsed container)
            if (loginModal.parentElement !== document.body) {
                // Modal might be inside a container that's collapsed - move to body
                document.body.appendChild(loginModal);
            }
            
            // Update modal title and description if available
            if (modalTitle) modalTitle.textContent = `${label} Portal Login`;
            if (modalDescription) modalDescription.textContent = `Sign in to access the ${label.toLowerCase()} portal.`;
            if (loginError) loginError.textContent = '';
            if (loginForm) loginForm.reset();
            
            // Auto-fill form if URL parameters were provided
            if (window.pendingLoginParams) {
                const { username, password } = window.pendingLoginParams;
                
                if (username && usernameField) {
                    usernameField.value = username;
                }
                
                if (password && passwordField) {
                    passwordField.value = password;
                }
                
                // Clear after use
                window.pendingLoginParams = null;
            }
            
            // Use requestAnimationFrame to ensure DOM is ready before setting styles
            requestAnimationFrame(() => {
                // Ensure modal is visible
                loginModal.style.display = 'block';
                loginModal.style.visibility = 'visible';
                
                // Show modal - use flex for proper centering of modal-content
                // Set multiple display properties to ensure it shows
                loginModal.style.display = 'flex';
                loginModal.style.alignItems = 'center';
                loginModal.style.justifyContent = 'center';
                loginModal.style.position = 'fixed';
                loginModal.style.top = '0';
                loginModal.style.left = '0';
                loginModal.style.width = '100%';
                loginModal.style.height = '100%';
                loginModal.style.minWidth = '100%';
                loginModal.style.minHeight = '100%';
                loginModal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                loginModal.style.margin = '0';
                loginModal.style.padding = '0';
                
                // Ensure high z-index and visibility
                loginModal.style.zIndex = '10000';
                loginModal.style.visibility = 'visible';
                loginModal.style.opacity = '1';
                loginModal.setAttribute('aria-hidden', 'false');
                
                // Ensure modal-content has proper dimensions
                const modalContent = loginModal.querySelector('.modal-content');
                if (modalContent) {
                    modalContent.style.display = 'block';
                    modalContent.style.position = 'relative';
                    modalContent.style.margin = 'auto';
                    modalContent.style.minWidth = '350px';
                    modalContent.style.minHeight = '200px';
                    modalContent.style.maxWidth = '500px';
                    modalContent.style.width = '90%';
                    modalContent.style.maxHeight = '80vh';
                    modalContent.style.overflowY = 'auto';
                }
                
                // Double-check computed style after a frame
                requestAnimationFrame(() => {
                    const computedDisplay = getComputedStyle(loginModal).display;
                    const computedVisibility = getComputedStyle(loginModal).visibility;
                    
                    // If still not showing, force it more aggressively
                    if (computedDisplay === 'none' || computedVisibility === 'hidden') {
                        loginModal.style.setProperty('display', 'flex', 'important');
                        loginModal.style.setProperty('visibility', 'visible', 'important');
                    }
                    
                    // Verify modal is actually visible on screen
                    const rect = loginModal.getBoundingClientRect();
                    const computed = getComputedStyle(loginModal);
                    
                    if (rect.width === 0 || rect.height === 0) {
                        console.error('Modal has zero dimensions! Computed:', computed.width, 'x', computed.height, 'but rect:', rect.width, 'x', rect.height);
                        
                        // Check parent containers
                        let parent = loginModal.parentElement;
                        let parentLevel = 0;
                        while (parent && parentLevel < 5) {
                            const parentComputed = getComputedStyle(parent);
                                display: parentComputed.display,
                                visibility: parentComputed.visibility,
                                height: parentComputed.height,
                                width: parentComputed.width,
                                overflow: parentComputed.overflow,
                                position: parentComputed.position
                            });
                            parent = parent.parentElement;
                            parentLevel++;
                        }
                        
                        // Try DOM manipulation - remove and re-add
                        const parentElement = loginModal.parentElement;
                        const nextSibling = loginModal.nextSibling;
                        
                        if (parentElement) {
                            parentElement.removeChild(loginModal);
                            void loginModal.offsetHeight; // Force reflow
                            
                            if (nextSibling) {
                                parentElement.insertBefore(loginModal, nextSibling);
                            } else {
                                parentElement.appendChild(loginModal);
                            }
                            
                            void loginModal.offsetHeight; // Force reflow again
                            
                            // Re-check after manipulation
                            requestAnimationFrame(() => {
                                const newRect = loginModal.getBoundingClientRect();
                                const newComputed = getComputedStyle(loginModal);
                                
                                if (newRect.width === 0 || newRect.height === 0) {
                                    console.error('Still zero dimensions after DOM manipulation. Modal may be in a collapsed container or have conflicting CSS.');
                                } else {
                                }
                            });
                        }
                    } else {
                    }
                });
            });
            
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
            
            // Focus management
            if (usernameField) {
                setTimeout(() => {
                    usernameField.focus();
                }, 100);
            }
            
            // Add click handler to close button if available
            const closeButton = document.getElementById('loginCloseButton');
            if (closeButton && !closeButton.dataset.handlerAttached) {
                closeButton.dataset.handlerAttached = 'true';
                closeButton.addEventListener('click', function() {
                    if (typeof closeLoginModal === 'function') {
                        closeLoginModal();
                    } else {
                        loginModal.style.display = 'none';
                        document.body.style.overflow = '';
                    }
                });
            }
            
            // Add click handler to cancel button if available
            const cancelButton = document.getElementById('loginCancelButton');
            if (cancelButton && !cancelButton.dataset.handlerAttached) {
                cancelButton.dataset.handlerAttached = 'true';
                cancelButton.addEventListener('click', function() {
                    if (typeof closeLoginModal === 'function') {
                        closeLoginModal();
                    } else {
                        loginModal.style.display = 'none';
                        document.body.style.overflow = '';
                    }
                });
            }
            
            // Click outside to close
            if (!loginModal.dataset.outsideHandlerAttached) {
                loginModal.dataset.outsideHandlerAttached = 'true';
                loginModal.addEventListener('click', function(e) {
                    if (e.target === loginModal) {
                        if (typeof closeLoginModal === 'function') {
                            closeLoginModal();
                        } else {
                            loginModal.style.display = 'none';
                            document.body.style.overflow = '';
                        }
                    }
                });
            }
        }
        
        // Also attach to window for explicit access
        window.openLoginModal = openLoginModal;
        
        // Modern showLogin function - replaces openPortalLogin
        // Modern showLogin function - simplified and reliable
        function showLogin(portal) {
            if (!portal) portal = 'default';
            
            // Set current portal
            if (typeof currentPortal !== 'undefined') {
                currentPortal = portal;
            }
            window.currentPortal = portal;
            
            const loginModal = document.getElementById('loginModal');
            const modalTitle = document.getElementById('loginModalTitle');
            const usernameInput = document.getElementById('loginUsername') || document.getElementById('username');
            const passwordInput = document.getElementById('loginPassword') || document.getElementById('password');
            const errorDiv = document.getElementById('loginError');
            
            if (!loginModal) {
                return;
            }
            
            // Update modal title
            if (modalTitle) {
                const PORTAL_LABELS = {
                    frontdesk: 'Front Desk',
                    consultant: 'Consultant',
                    dispenser: 'Branch',
                    admin: 'Admin',
                    finance: 'Finance',
                    stock: 'Stock Management',
                    mis: 'MIS',
                    gm: 'General Manager',
                    director: 'Director',
                    'hr-portal': 'HR',
                    client: 'Client',
                    default: 'Portal'
                };
                const label = PORTAL_LABELS[portal] || portal.charAt(0).toUpperCase() + portal.slice(1);
                modalTitle.textContent = `${label} Portal Login`;
            }
            
            // Clear form and errors
            if (usernameInput) {
                usernameInput.value = '';
                usernameInput.focus();
            }
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.type = 'password';
            }
            if (errorDiv) {
                errorDiv.style.display = 'none';
                const errorText = document.getElementById('loginErrorText');
                if (errorText) errorText.textContent = '';
            }
            
            // Show modal - simple and direct
            loginModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
        // Helper function to close login modal
        function closeLoginModal() {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
        
        // Toggle password visibility
        function togglePasswordVisibility() {
            const passwordInput = document.getElementById('loginPassword') || document.getElementById('password');
            const toggleBtn = document.getElementById('togglePassword');
            if (passwordInput && toggleBtn) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    toggleBtn.textContent = '🙈';
                } else {
                    passwordInput.type = 'password';
                    toggleBtn.textContent = '👁️';
                }
            }
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            const loginModal = document.getElementById('loginModal');
            if (loginModal && event.target === loginModal) {
                closeLoginModal();
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                const loginModal = document.getElementById('loginModal');
                if (loginModal && loginModal.style.display === 'block') {
                    closeLoginModal();
                }
            }
        });
        
        // Attach to window for global access
        window.showLogin = showLogin;
        window.closeLoginModal = closeLoginModal;
        window.togglePasswordVisibility = togglePasswordVisibility;
        
        // Debounce utility for search/filter inputs
        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        // Export a section to PDF via print
        function exportSectionToPDF(sectionId) {
            try {
                const section = document.getElementById(sectionId);
                if (!section) return alert('Section not found');
                const win = window.open('', '_blank', 'width=1024,height=768');
                if (!win) return alert('Popup blocked. Allow popups to export.');
                const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                    .map(el => el.outerHTML).join('\n');
                win.document.write(`<!DOCTYPE html><html><head><title>Export</title>${styles}</head><body>`);
                win.document.write(section.outerHTML);
                win.document.write('</body></html>');
                win.document.close();
                win.focus();
                setTimeout(() => { win.print(); win.close(); }, 250);
            } catch (e) {
                console.error('Export error', e);
                alert('Failed to export.');
            }
        }

        // Global alerts: updates banner using available data
        function updateGlobalAlerts(opts = {}) {
            const container = document.getElementById('globalAlerts');
            if (!container) return;
            const alerts = [];
            // Pending approvals from GM
            const pendingCount = (opts.pendingApprovalsCount != null) ? opts.pendingApprovalsCount : (window.gmPendingApprovalsCount || 0);
            if (pendingCount > 0) alerts.push(`<div class="alert"><strong>Pending Approvals:</strong> ${pendingCount} item(s) awaiting GM action.</div>`);
            // Pending orders (if computed elsewhere)
            const pendingOrders = window.pendingOrdersCount || 0;
            if (pendingOrders > 0) alerts.push(`<div class="alert"><strong>Pending Orders:</strong> ${pendingOrders} order(s) require attention.</div>`);
            // Data errors
            if (window.lastDataError) alerts.push(`<div class="alert"><strong>Data Error:</strong> ${window.lastDataError}</div>`);
            container.innerHTML = alerts.join('');
            container.style.display = alerts.length ? 'block' : 'none';
        }
        window.updateGlobalAlerts = updateGlobalAlerts;

        // Lightweight role-based access control
        const ROLE_TABS = {
            gm: ['gm','director','admin'],
            director: ['director','admin'],
            finance: ['finance','director','admin'],
            'hr-portal': ['hr_manager','hr_admin','admin'],
            stock: ['stock_manager','director','admin']
        };

        function setCurrentUserRole(role){ try{ localStorage.setItem('currentUserRole', role); applyRoleGuards(); }catch(_){} }
        function getCurrentUserRole(){ try{ return localStorage.getItem('currentUserRole') || 'guest'; }catch(_){ return 'guest'; } }
        function applyRoleGuards(){
            const tabButtons = document.querySelectorAll('.tabs .tab-button');
            tabButtons.forEach(btn => {
                const onclick = btn.getAttribute('onclick') || '';
                const match = onclick.match(/openTab\('([^']+)'/);
                const tabId = match ? match[1] : null;
                if (tabId && Array.isArray(ROLE_TABS[tabId])) {
                    btn.dataset.allowedRoles = ROLE_TABS[tabId].join(',');
                }
                btn.style.display = '';
            });
        }
        document.addEventListener('DOMContentLoaded', function() {
            applyRoleGuards();
        });
        
        // Role to Portal Access Mapping
        const ROLE_PORTAL_ACCESS = {
            'admin': ['admin', 'client', 'frontdesk', 'consultant', 'dispenser', 'hr-portal', 'finance', 'gm', 'director', 'mis', 'stock'],
            'frontdesk': ['frontdesk', 'client'],
            'consultant': ['consultant'],
            'sales_staff': ['dispenser', 'frontdesk', 'client'],
            'dispenser': ['dispenser', 'frontdesk', 'client'],
            'branch_manager': ['dispenser', 'mis', 'frontdesk', 'client'],
            'finance': ['finance', 'client'],
            'hr_manager': ['hr-portal', 'client'],
            'hr_admin': ['hr-portal', 'client'],
            'hr-portal': ['hr-portal', 'client'],
            'gm': ['gm', 'director', 'client'],
            'director': ['director', 'gm', 'client'],
            'mis': ['mis', 'client'],
            'stock': ['stock', 'client'],
            'warehouse_manager': ['stock', 'client'],
            'warehouse_manager_ondangwa': ['stock', 'client'],
            'warehouse_manager_windhoek': ['stock', 'client'],
            'client': ['client'],
            'guest': ['client'] // Guest can only access shop
        };

        const ROLE_ACCESS_ALIASES = {
            'distributor': 'client',
            'finance_manager': 'finance',
            'general_manager': 'gm',
            'stock_manager': 'stock',
            'warehouse': 'stock',
            'hr': 'hr-portal',
            'hr_portal': 'hr-portal',
            'mlm': 'client',
            'lrp': 'client',
            'reports': 'mis'
        };

        Object.entries(ROLE_ACCESS_ALIASES).forEach(([alias, baseRole]) => {
            if (!ROLE_PORTAL_ACCESS[alias] && ROLE_PORTAL_ACCESS[baseRole]) {
                ROLE_PORTAL_ACCESS[alias] = ROLE_PORTAL_ACCESS[baseRole];
            }
        });

        function getDefaultPortalForRole(role) {
            const normalized = (role || '').toLowerCase();
            const allowed = ROLE_PORTAL_ACCESS[normalized];
            if (Array.isArray(allowed) && allowed.length) {
                const primary = allowed.find(portal => portal !== 'client') || allowed[0];
                return primary || 'client';
            }
            return 'dispenser';
        }
        
        // Warehouse assignment mapping
        const WAREHOUSE_ASSIGNMENTS = {
            'warehouse_manager_ondangwa': 'Ondangwa',
            'warehouse_manager_windhoek': 'Windhoek'
        };
        
        // Current warehouse filter (for warehouse managers)
        let currentWarehouseFilter = null;
        
        // Auto-restore session on page load
        function restoreSession() {
            try {
                const stored = localStorage.getItem('dyna_portal_user');
                if (!stored) return false;
                
                const userData = JSON.parse(stored);
                const age = Date.now() - (userData.timestamp || 0);
                const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
                
                if (age > maxAge) {
                    localStorage.removeItem('dyna_portal_user');
                    return false;
                }
                
                window.currentUser = userData;
                
                // Wait for all functions to be loaded before attempting login
                let retries = 0;
                const maxRetries = 50; // Max 10 seconds (50 * 200ms)
                
                const tryLogin = () => {
                    retries++;
                    
                    // Check if all functions have loaded
                    if (!window.functionsLoaded) {
                        if (retries < maxRetries) {
                            if (retries === 1 || retries % 10 === 0) {
                            }
                            setTimeout(tryLogin, 200);
                        } else {
                            console.error('❌ Timeout: Functions did not load in time. Please refresh the page.');
                            alert('Page loading timeout. Please refresh the page.');
                        }
                        return;
                    }
                    
                    // Functions are loaded, now call handlePortalLoginSuccess
                    if (typeof window.handlePortalLoginSuccess === 'function') {
                        window.handlePortalLoginSuccess(userData, { silent: true });
                    } else if (typeof handlePortalLoginSuccess === 'function') {
                        handlePortalLoginSuccess(userData, { silent: true });
                    } else {
                        console.error('❌ handlePortalLoginSuccess not found even after functions loaded!');
                        alert('Login system error. Please refresh the page.');
                    }
                };
                
                setTimeout(tryLogin, 300);
                return true;
            } catch (e) {
                console.warn('Failed to restore session:', e);
                return false;
            }
        }
        
        // Wait for functions to be fully loaded before trying to restore session
        // Guard: only allow ONE session restore to run to prevent double-restore race condition
        window._sessionRestoreDone = false;
        function _runRestoreOnce() {
            if (window._sessionRestoreDone) return;
            window._sessionRestoreDone = true;
            restoreSession();
        }

        if (window.functionsLoaded) {
            // Functions already loaded (unlikely but possible)
            setTimeout(_runRestoreOnce, 500);
        } else {
            // Wait for the functionsReady event (primary path)
            window.addEventListener('functionsReady', () => {
                setTimeout(_runRestoreOnce, 500);
            });
            
            // Fallback: if event doesn't fire within 3s, try anyway
            setTimeout(() => {
                if (!window._sessionRestoreDone) {
                    _runRestoreOnce();
                }
            }, 3000);
        }
        
        // Define loginPortalRequest early for staff login
        if (typeof window.loginPortalRequest === 'undefined') {
            window.loginPortalRequest = async function loginPortalRequest(username, password) {
                // Try API first
                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password }),
                        credentials: 'include'
                    });
                    let data = null;
                    try {
                        data = await response.json();
                    } catch (_) {}
                    if (response.ok && data) {
                        return data;
                    }
                    // API failed, try local fallback
                } catch (apiError) {
                }
                
                // Local fallback authentication
                const fallbackUsers = safeParseFromStorage('dyna_users', DEFAULT_USERS_JSON);
                let localUsers = Array.isArray(fallbackUsers) ? fallbackUsers : [];
                if (!localUsers.some(user => typeof user?.password === 'string' && user.password.length > 0)) {
                    try {
                        localUsers = JSON.parse(DEFAULT_USERS_JSON);
                    } catch (_) {
                        localUsers = [];
                    }
                }
                
                
                const user = localUsers.find(u => 
                    u.username.toLowerCase() === username.toLowerCase() && 
                    u.password === password
                );
                
                if (!user) {
                    // Check if username exists but password is wrong
                    const userExists = localUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
                    if (userExists) {
                        console.error('❌ Username found but password incorrect for:', username);
                        throw new Error('Invalid password. Passwords are case-sensitive.');
                    } else {
                        console.error('❌ Username not found:', username);
                        throw new Error('Username not found.');
                    }
                }
                
                // User authenticated successfully
                return { 
                    success: true, 
                    user: {
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        fullName: user.fullName,
                        full_name: user.fullName,
                        email: user.email,
                        branch: user.branch || null,
                        branches: []
                    }
                };
            };
        }
        
        // Warehouse Manager Login Functions
        function showWarehouseManagerLogin() {
            // Set currentPortal before opening login modal
            currentPortal = 'stock';
            window.currentPortal = 'stock';
            showLogin('stock');
        }
        
        function hideWarehouseManagerLogin() {
            const modal = document.getElementById('warehouseManagerLoginModal');
            if (modal) modal.style.display = 'none';
        }
        
        async function submitWarehouseManagerLogin() {
            const warehouse = document.getElementById('warehouseSelect').value;
            const username = document.getElementById('warehouseUsername').value.trim();
            const password = document.getElementById('warehousePassword').value;
            const loginBtn = document.getElementById('warehouseLoginBtn');
            const errorDiv = document.getElementById('warehouseLoginError');
            
            // Clear previous errors
            if (errorDiv) errorDiv.style.display = 'none';
            
            // Validation
            if (!warehouse) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please select a warehouse';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            if (!username || !password) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please enter both username and password';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            // Show loading state
            if (loginBtn) {
                const btnText = loginBtn.querySelector('.btn-text');
                const btnLoading = loginBtn.querySelector('.btn-loading');
                if (btnText) btnText.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'inline';
                loginBtn.disabled = true;
            }
            
            try {
                // Try API login first (if function exists)
                let apiResult = { success: false };
                if (typeof authenticateViaApi === 'function') {
                    apiResult = await authenticateViaApi(username, password);
                } else if (typeof window.authenticateViaApi === 'function') {
                    apiResult = await window.authenticateViaApi(username, password);
                }
                
                if (apiResult.success && apiResult.user) {
                    const user = apiResult.user;
                    const role = (user.role || '').toLowerCase();
                    
                    // Verify warehouse manager role
                    const expectedRole = `warehouse_manager_${warehouse}`;
                    if (role !== expectedRole && role !== 'warehouse_manager' && role !== 'admin') {
                        throw new Error(`Access denied. This account is not authorized for ${warehouse} warehouse management.`);
                    }
                    
                    // Set warehouse filter
                    currentWarehouseFilter = warehouse === 'ondangwa' ? 'Ondangwa' : 'Windhoek';
                    user.warehouse = currentWarehouseFilter;
                    user.warehouseFilter = warehouse;
                    
                    // Store warehouse filter in localStorage
                    localStorage.setItem('warehouseFilter', currentWarehouseFilter);
                    
                    // Login successful
                    handlePortalLoginSuccess(user, { silent: true });
                    hideWarehouseManagerLogin();
                    
                    // Open stock portal
                    currentPortal = 'stock';
                    window.currentPortal = 'stock';
                    openTab('stock', null);
                    
                    // Show warehouse-specific welcome
                    showToast(`Welcome to ${currentWarehouseFilter} Warehouse Management`, 'success');
                    
                    // Apply warehouse filter to stock portal
                    applyWarehouseFilter();
                } else {
                    // Try local fallback
                    // Database API only - no localStorage fallback
                    // const localUsers = JSON.parse(localStorage.getItem('users') || '[]');
                    const localUsers = []; // Load from API only
                    const localUser = localUsers.find(u => 
                        u.username === username && 
                        u.password === password &&
                        (u.role === `warehouse_manager_${warehouse}` || u.role === 'warehouse_manager' || u.role === 'admin')
                    );
                    
                    if (localUser) {
                        localUser.warehouse = warehouse === 'ondangwa' ? 'Ondangwa' : 'Windhoek';
                        localUser.warehouseFilter = warehouse;
                        currentWarehouseFilter = localUser.warehouse;
                        localStorage.setItem('warehouseFilter', currentWarehouseFilter);
                        
                        handlePortalLoginSuccess(localUser, { silent: true });
                        hideWarehouseManagerLogin();
                        currentPortal = 'stock';
                        window.currentPortal = 'stock';
                        openTab('stock', null);
                        applyWarehouseFilter();
                        showToast(`Welcome to ${currentWarehouseFilter} Warehouse Management`, 'success');
                    } else {
                        throw new Error('Invalid credentials or insufficient permissions for warehouse management.');
                    }
                }
            } catch (error) {
                console.error('Warehouse manager login error:', error);
                if (errorDiv) {
                    errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
                    errorDiv.style.display = 'block';
                }
            } finally {
                // Restore button state
                if (loginBtn) {
                    const btnText = loginBtn.querySelector('.btn-text');
                    const btnLoading = loginBtn.querySelector('.btn-loading');
                    if (btnText) btnText.style.display = 'inline';
                    if (btnLoading) btnLoading.style.display = 'none';
                    loginBtn.disabled = false;
                }
            }
        }
        
        // Apply warehouse filter to stock portal
        function applyWarehouseFilter() {
            if (!currentWarehouseFilter) {
                const savedFilter = localStorage.getItem('warehouseFilter');
                const activeUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : window.currentUser;
                const userRole = ((activeUser && activeUser.role) || '').toLowerCase();
                if (userRole === 'warehouse_manager_ondangwa') {
                    currentWarehouseFilter = 'Ondangwa';
                } else if (userRole === 'warehouse_manager_windhoek') {
                    currentWarehouseFilter = 'Windhoek';
                } else if (savedFilter) {
                    currentWarehouseFilter = savedFilter;
                }
            }
            
            if (currentWarehouseFilter) {
                // Add warehouse filter badge to stock portal header
                const stockHeader = document.querySelector('#stockContent .stock-hub-hero__text');
                if (stockHeader && !document.getElementById('warehouseFilterBadge')) {
                    const badge = document.createElement('div');
                    badge.id = 'warehouseFilterBadge';
                    badge.style.cssText = 'margin-top: 12px; padding: 8px 16px; background: #10b981; color: white; border-radius: 20px; display: inline-block; font-weight: 600; font-size: 0.9rem;';
                    badge.textContent = `🏭 ${currentWarehouseFilter} Warehouse Only`;
                    stockHeader.appendChild(badge);
                }
                
                // Filter all stock data functions
                window.warehouseFilter = currentWarehouseFilter;
            }
        }
        
        // Override stock loading functions to filter by warehouse
        function filterStockByWarehouse(data) {
            if (!currentWarehouseFilter || !data) return data;
            
            if (Array.isArray(data)) {
                return data.filter(item => {
                    const location = item.location || item.warehouse || item.branch || '';
                    const category = item.category || '';
                    return location.toLowerCase().includes(currentWarehouseFilter.toLowerCase()) ||
                           category.toLowerCase().includes(currentWarehouseFilter.toLowerCase());
                });
            }
            
            if (typeof data === 'object') {
                const filtered = { ...data };
                Object.keys(filtered).forEach(key => {
                    if (Array.isArray(filtered[key])) {
                        filtered[key] = filtered[key].filter(item => {
                            const location = item.location || item.warehouse || item.branch || '';
                            const category = item.category || '';
                            return location.toLowerCase().includes(currentWarehouseFilter.toLowerCase()) ||
                                   category.toLowerCase().includes(currentWarehouseFilter.toLowerCase());
                        });
                    }
                });
                return filtered;
            }
            
            return data;
        }
        
        // Override displayOndangwaStock to show filtered data for warehouse managers
        const originalDisplayOndangwaStock = window.displayOndangwaStock;
        if (typeof originalDisplayOndangwaStock === 'function') {
            window.displayOndangwaStock = function() {
                if (currentWarehouseFilter === 'Ondangwa') {
                    // Show only Ondangwa warehouse data
                    const result = originalDisplayOndangwaStock.apply(this, arguments);
                    // Filter the displayed list
                    const stockList = document.getElementById('ondangwaStockList');
                    if (stockList) {
                        const items = stockList.querySelectorAll('[data-warehouse], [data-location]');
                        items.forEach(item => {
                            const warehouse = item.getAttribute('data-warehouse') || item.getAttribute('data-location') || '';
                            if (warehouse.toLowerCase() !== 'ondangwa') {
                                item.style.display = 'none';
                            }
                        });
                    }
                    return result;
                } else if (currentWarehouseFilter && currentWarehouseFilter !== 'Ondangwa') {
                    // Hide Ondangwa tab if not Ondangwa warehouse manager
                    const ondangwaTab = document.getElementById('stockTabOndangwa');
                    if (ondangwaTab) ondangwaTab.style.display = 'none';
                    return;
                }
                return originalDisplayOndangwaStock.apply(this, arguments);
            };
        }
        
        // Override stock data loading to apply warehouse filter
        function applyWarehouseFilterToStockData() {
            if (!currentWarehouseFilter) return;
            
            // Filter ondangwaStock array
            if (window.ondangwaStock && Array.isArray(window.ondangwaStock)) {
                window.ondangwaStock = window.ondangwaStock.filter(item => {
                    const location = item.location || item.warehouse || '';
                    const category = item.category || '';
                    return location.toLowerCase().includes(currentWarehouseFilter.toLowerCase()) ||
                           category.toLowerCase().includes(currentWarehouseFilter.toLowerCase());
                });
            }
            
            // Filter localStorage data when loading
            const originalGetItem = Storage.prototype.getItem;
            Storage.prototype.getItem = function(key) {
                const value = originalGetItem.call(this, key);
                if (currentWarehouseFilter && (key === 'dyna_ondangwaStock' || key === 'dyna_warehouse_stock')) {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) {
                            const filtered = parsed.filter(item => {
                                const location = item.location || item.warehouse || item.branch || '';
                                const category = item.category || '';
                                return location.toLowerCase().includes(currentWarehouseFilter.toLowerCase()) ||
                                       category.toLowerCase().includes(currentWarehouseFilter.toLowerCase());
                            });
                            return JSON.stringify(filtered);
                        }
                    } catch (e) {
                        // Not JSON, return as is
                    }
                }
                return value;
            };
        }
        
        // Initialize warehouse filter on stock portal load
        const originalShowStockTab = window.showStockTab;
        if (typeof originalShowStockTab === 'function') {
            window.showStockTab = function(tab) {
                applyWarehouseFilter();
                applyWarehouseFilterToStockData();
                return originalShowStockTab.apply(this, arguments);
            };
        }
        
        // =============================================================================
        // Stock Management Portal — Data Helpers & Workflows
        // =============================================================================
        const STOCK_STORAGE_KEYS = {
            purchaseOrders: 'dyna_purchase_orders_v3',
            supplierScores: 'dyna_supplier_scores_v1',
            forecasts: 'dyna_stock_forecasts_v1'
        };

        const DEFAULT_PURCHASE_ORDERS = [
            {
                id: 'PO-2025-0001',
                supplier: 'Dynapharm Malaysia',
                eta: '2025-11-12',
                currency: 'NAD',
                value: 48200,
                status: 'In Transit',
                notes: 'Priority replenishment for year-end sales',
                createdAt: '2025-10-30T08:15:00.000Z',
                items: [
                    { cartonNo: 'A1-92', description: "DI LIQUID ALFALFA 500ml", batchNo: 'DL-2412', expiry: '2026-12', quantity: 180, totalCtns: 18 },
                    { cartonNo: 'B4-11', description: "D.I NONI 500ml", batchNo: 'DN-2408', expiry: '2026-08', quantity: 150, totalCtns: 15 }
                ]
            },
            {
                id: 'PO-2025-0002',
                supplier: 'Dynapharm Singapore',
                eta: '2025-12-04',
                currency: 'NAD',
                value: 26350,
                status: 'Open',
                notes: 'Includes promotional packs for Q1 launch',
                createdAt: '2025-11-05T09:00:00.000Z',
                items: [
                    { cartonNo: 'S3-07', description: "SPIRULINA TABLET (300's)", batchNo: 'SP-2501', expiry: '2027-01', quantity: 120, totalCtns: 12 },
                    { cartonNo: 'H8-19', description: "HIGH FIBER NUTRITION FOOD", batchNo: 'HF-2502', expiry: '2026-10', quantity: 90, totalCtns: 9 }
                ]
            }
        ];

        const DEFAULT_STOCK_FORECASTS = [
            { id: 'fc-1', product: "DI LIQUID ALFALFA 500ml", demand: 280, coverageDays: 12, action: 'Reorder', risk: 'High' },
            { id: 'fc-2', product: "SPIRULINA TABLET (300's)", demand: 190, coverageDays: 22, action: 'Monitor', risk: 'Medium' },
            { id: 'fc-3', product: "D.I NONI 500ml", demand: 320, coverageDays: 9, action: 'Expedite', risk: 'High' },
            { id: 'fc-4', product: "GANODERMA LOTION 150ML", demand: 140, coverageDays: 35, action: 'Healthy', risk: 'Low' }
        ];

        const DEFAULT_SUPPLIER_SCORES = [
            { supplier: 'Dynapharm Malaysia', otif: 96, avgLeadTime: 28, openOrders: 1, totalValue: 48200 },
            { supplier: 'Dynapharm Singapore', otif: 92, avgLeadTime: 32, openOrders: 1, totalValue: 26350 }
        ];

        function cloneDefault(value) {
            return JSON.parse(JSON.stringify(value));
        }

        function getStockStorageValue(key, fallbackValue) {
            try {
                if (typeof safeParseFromStorage === 'function') {
                    const parsed = safeParseFromStorage(key, JSON.stringify(fallbackValue));
                    if (Array.isArray(fallbackValue)) {
                        return Array.isArray(parsed) && parsed.length ? parsed : cloneDefault(fallbackValue);
                    }
                    if (fallbackValue && typeof fallbackValue === 'object') {
                        return parsed && typeof parsed === 'object' ? parsed : cloneDefault(fallbackValue);
                    }
                    return parsed ?? fallbackValue;
                }
                const raw = localStorage.getItem(key);
                if (!raw) return cloneDefault(fallbackValue);
                const parsed = JSON.parse(raw);
                if (Array.isArray(fallbackValue) && !Array.isArray(parsed)) return cloneDefault(fallbackValue);
                if (fallbackValue && typeof fallbackValue === 'object' && typeof parsed !== 'object') return cloneDefault(fallbackValue);
                return parsed ?? cloneDefault(fallbackValue);
            } catch (error) {
                console.warn('Stock storage parse error for', key, error);
                return cloneDefault(fallbackValue);
            }
        }

        function setStockStorageValue(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.warn('Unable to persist stock data for', key, error);
            }
        }

        function notifyStock(message, variant = 'info') {
            if (typeof showToast === 'function') {
                showToast(message, variant);
            } else {
            }
        }

        function formatCurrency(value, currency = 'N$') {
            const num = Number(value) || 0;
            return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        }

        function sanitizeInputValue(value) {
            if (value === undefined || value === null) return '';
            return String(value).replace(/"/g, '&quot;');
        }

        function getStoredPurchaseOrders() {
            return getStockStorageValue(STOCK_STORAGE_KEYS.purchaseOrders, DEFAULT_PURCHASE_ORDERS);
        }

        function savePurchaseOrders(orders) {
            setStockStorageValue(STOCK_STORAGE_KEYS.purchaseOrders, orders);
        }

        function getStockForecastData() {
            let forecasts = getStockStorageValue(STOCK_STORAGE_KEYS.forecasts, DEFAULT_STOCK_FORECASTS);
            if (!Array.isArray(forecasts) || forecasts.length === 0) {
                forecasts = cloneDefault(DEFAULT_STOCK_FORECASTS);
            }
            try {
                const barcodeStock = getStockStorageValue('dyna_barcode_stock', []);
                if (Array.isArray(barcodeStock) && barcodeStock.length) {
                    const aggregated = {};
                    barcodeStock.forEach(batch => {
                        const label = batch.description || batch.productName || batch.name;
                        if (!label) return;
                        aggregated[label] = (aggregated[label] || 0) + Number(batch.remainingQuantity ?? batch.quantity ?? 0);
                    });
                    forecasts = forecasts.map(entry => {
                        const currentStock = aggregated[entry.product] || entry.currentStock || 0;
                        const dailyDemand = entry.demand ? entry.demand / 30 : 8;
                        const coverage = dailyDemand > 0 ? Math.round(currentStock / dailyDemand) : entry.coverageDays;
                        return Object.assign({}, entry, { currentStock, coverageDays: coverage });
                    });
                }
            } catch (error) {
            }
            return forecasts;
        }

        function updateStockOverviewMetrics({ orders = [], forecasts = [] } = {}) {
            const totalValue = orders.reduce((sum, order) => sum + Number(order.value || 0), 0);
            const pendingOrders = orders.filter(order => (order.status || '').toLowerCase() !== 'delivered').length;
            const lowStock = forecasts.filter(item => (item.action || '').toLowerCase() !== 'healthy').length;

            const totalValueEl = document.getElementById('overviewTotalValue');
            if (totalValueEl) {
                totalValueEl.textContent = formatCurrency(totalValue);
            }

            const pendingEl = document.getElementById('overviewPendingOrders');
            if (pendingEl) {
                pendingEl.textContent = pendingOrders;
            }
            window.pendingOrdersCount = pendingOrders;

            const lowStockEl = document.getElementById('overviewLowStock');
            if (lowStockEl) {
                lowStockEl.textContent = lowStock;
            }
        }

        function handleStockQuickAction(arg1, arg2) {
            let evt = null;
            let action = null;
            if (typeof arg1 === 'string' && !arg2) {
                action = arg1;
            } else {
                evt = arg1 || null;
                action = arg2 || null;
            }
            if (!action) return;
            try {
                if (evt?.preventDefault) evt.preventDefault();

                if (typeof toggleStockView === 'function') {
                    toggleStockView('main', true); // Skip auto-switch to overview
                }

                // Handle countryImport with mode detection
                if (action === 'countryImport' && evt?.currentTarget) {
                    const mode = evt.currentTarget.dataset?.importMode || 'manual';
                    setTimeout(() => {
                        if (typeof spotlightCountryImport === 'function') {
                            spotlightCountryImport(mode);
                        }
                    }, 150);
                }

                if (typeof showStockTab === 'function') {
                    showStockTab(action, evt);
                }

                // Remove active states from all quick action buttons and sidebar links
                const quickButtons = document.querySelectorAll('#stockContent .hub-action, #stockContent .stock-quick-btn, #stockContent .stock-sidebar-links button');
                quickButtons.forEach(btn => {
                    btn.classList.remove('hub-action--active');
                    btn.classList.remove('stock-quick-btn--active');
                    btn.classList.remove('active');
                });

                // Add active state to the triggering button
                const trigger = evt?.currentTarget || null;
                if (trigger) {
                    if (trigger.classList.contains('stock-quick-btn')) {
                        trigger.classList.add('stock-quick-btn--active');
                    } else if (trigger.classList.contains('stock-sidebar-links') || trigger.closest('.stock-sidebar-links')) {
                        trigger.classList.add('active');
                    } else {
                        trigger.classList.add('hub-action--active');
                    }
                } else {
                    // Fallback: find button by data attribute
                    const fallbackBtn = document.querySelector(`#stockContent [data-stock-action="${action}"]`);
                    if (fallbackBtn) {
                        if (fallbackBtn.classList.contains('stock-quick-btn')) {
                            fallbackBtn.classList.add('stock-quick-btn--active');
                        } else if (fallbackBtn.closest('.stock-sidebar-links')) {
                            fallbackBtn.classList.add('active');
                        } else {
                            fallbackBtn.classList.add('hub-action--active');
                        }
                    }
                }

                // Scroll to target after a brief delay to ensure tab is visible
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const customTargetId = trigger?.dataset?.target;
                        const candidates = [
                            customTargetId,
                            `${action}Tab`,
                            `stock-tab-${action}`,
                            `${action}-tab`,
                            `${action}_tab`
                        ].filter(Boolean);
                        const target = candidates
                            .map(id => document.getElementById(id))
                            .find(Boolean);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 200);
                });
            } catch (error) {
                console.warn('handleStockQuickAction error:', error);
            }
        }
        window.handleStockQuickAction = handleStockQuickAction;

        function spotlightCountryImport(mode = 'prompt') {
            const launchpad = document.getElementById('countryImportLaunchpad');
            if (launchpad) {
                launchpad.scrollIntoView({ behavior: 'smooth', block: 'start' });
                launchpad.classList.add('pulse-highlight');
                setTimeout(() => launchpad.classList.remove('pulse-highlight'), 1200);
            }
            if (mode === 'manual') {
                focusManualImportCapture();
            } else if (mode === 'csv') {
                startCsvImportWorkflow();
            }
        }

        function focusManualImportCapture() {
            requestAnimationFrame(() => {
                const form = document.getElementById('bulkStockImportForm');
                if (!form) return;
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                form.classList.add('pulse-highlight');
                setTimeout(() => form.classList.remove('pulse-highlight'), 1200);
                const focusField = form.querySelector('.stock-description');
                if (focusField) {
                    focusField.focus({ preventScroll: true });
                }
            });
        }

        function startCsvImportWorkflow() {
            requestAnimationFrame(() => {
                const trigger = document.querySelector('#bulkStockImportForm button[data-import-csv-trigger="true"]');
                if (typeof importFromCSV === 'function') {
                    importFromCSV(trigger || document.getElementById('bulkStockImportForm'));
                }
            });
        }

        function createPurchaseOrderRow(prefill = {}) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" class="po-carton-no" placeholder="A1-98"></td>
                <td><input type="text" class="po-description" placeholder="Product description" required></td>
                <td><input type="text" class="po-batch-no" placeholder="DP24265" required></td>
                <td><input type="month" class="po-expiry-date" placeholder="YYYY-MM" required></td>
                <td><input type="number" class="po-quantity" placeholder="Qty" min="1" required></td>
                <td><input type="number" class="po-total-ctns" placeholder="CTNS" min="1" required></td>
                <td style="text-align:center;"><button type="button" class="btn btn-danger" onclick="removePurchaseOrderRow(this)">Remove</button></td>
            `;
            const mapping = {
                '.po-carton-no': prefill.cartonNo,
                '.po-description': prefill.description,
                '.po-batch-no': prefill.batchNo,
                '.po-expiry-date': prefill.expiry,
                '.po-quantity': prefill.quantity,
                '.po-total-ctns': prefill.totalCtns
            };
            Object.keys(mapping).forEach(selector => {
                const input = tr.querySelector(selector);
                if (input && mapping[selector] !== undefined) {
                    input.value = mapping[selector];
                }
            });
            return tr;
        }

        function addPurchaseOrderRow(prefill = {}) {
            const tbody = document.getElementById('purchaseOrderTableBody');
            if (!tbody) return;
            const row = createPurchaseOrderRow(prefill);
            tbody.appendChild(row);
        }
        window.addPurchaseOrderRow = addPurchaseOrderRow;

        function removePurchaseOrderRow(button) {
            if (!button) return;
            const row = button.closest('tr');
            const tbody = document.getElementById('purchaseOrderTableBody');
            if (row && tbody) {
                row.remove();
                if (!tbody.querySelector('tr')) {
                    addPurchaseOrderRow();
                }
            }
        }
        window.removePurchaseOrderRow = removePurchaseOrderRow;

        function clearPurchaseOrderForm() {
            const form = document.getElementById('purchaseOrderForm');
            const tbody = document.getElementById('purchaseOrderTableBody');
            if (form) {
                form.reset();
            }
            if (tbody) {
                tbody.innerHTML = '';
                addPurchaseOrderRow();
            }
            notifyStock('Purchase order form cleared.', 'info');
        }
        window.clearPurchaseOrderForm = clearPurchaseOrderForm;

        function collectPurchaseOrderRows() {
            const tbody = document.getElementById('purchaseOrderTableBody');
            if (!tbody) return [];
            return Array.from(tbody.querySelectorAll('tr')).map(row => {
                const get = selector => row.querySelector(selector)?.value?.trim() || '';
                return {
                    cartonNo: get('.po-carton-no'),
                    description: get('.po-description'),
                    batchNo: get('.po-batch-no'),
                    expiry: get('.po-expiry-date'),
                    quantity: Number(get('.po-quantity')) || 0,
                    totalCtns: Number(get('.po-total-ctns')) || 0
                };
            }).filter(item => item.description);
        }

        function autoGeneratePurchaseOrdersFromMovements() {
            const branchStock = getStockStorageValue('dyna_branch_stock', {});
            const aggregated = {};
            if (branchStock && typeof branchStock === 'object') {
                Object.values(branchStock).forEach(stock => {
                    if (!stock || typeof stock !== 'object') return;
                    Object.keys(stock).forEach(productName => {
                        const qty = Number(stock[productName] || 0);
                        if (qty <= 5) {
                            if (!aggregated[productName]) {
                                aggregated[productName] = { description: productName, requested: 0 };
                            }
                            aggregated[productName].requested += Math.max(20 - qty, 10);
                        }
                    });
                });
            }
            let suggestions = Object.values(aggregated).sort((a, b) => b.requested - a.requested).slice(0, 5);
            if (!suggestions.length && Array.isArray(window.PRICE_LIST)) {
                suggestions = window.PRICE_LIST.slice(0, 3).map(item => ({
                    description: item.description,
                    requested: 30
                }));
            }
            const tbody = document.getElementById('purchaseOrderTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (!suggestions.length) {
                addPurchaseOrderRow();
                notifyStock('No demand signals available. Added a blank row instead.', 'info');
                return;
            }
            suggestions.forEach((item, index) => {
                const today = new Date();
                const expiryDate = new Date(today);
                expiryDate.setMonth(expiryDate.getMonth() + 12);
                const row = createPurchaseOrderRow({
                    cartonNo: `AUTO-${index + 1}`,
                    description: item.description,
                    batchNo: `AUTO-${today.getFullYear()}${index + 1}`,
                    expiry: expiryDate.toISOString().slice(0, 7),
                    quantity: Math.max(10, item.requested || 10),
                    totalCtns: Math.ceil(Math.max(10, item.requested || 10) / 10)
                });
                tbody.appendChild(row);
            });
            notifyStock('Generated purchase order lines from movement history.', 'success');
        }
        window.autoGeneratePurchaseOrdersFromMovements = autoGeneratePurchaseOrdersFromMovements;

        function handlePurchaseOrderSubmit(event) {
            event?.preventDefault();
            const form = document.getElementById('purchaseOrderForm');
            if (!form) return;
            const supplier = document.getElementById('poSupplier')?.value?.trim() || '';
            const poNumber = document.getElementById('poNumber')?.value?.trim() || `PO-${Date.now()}`;
            const eta = document.getElementById('poEta')?.value || '';
            const value = Number(document.getElementById('poValue')?.value || 0);
            const currency = document.getElementById('poCurrency')?.value || 'NAD';
            const status = document.getElementById('poStatus')?.value || 'Open';
            const notes = document.getElementById('poNotes')?.value?.trim() || '';
            const items = collectPurchaseOrderRows();
            if (!supplier || !items.length) {
                notifyStock('Supplier and at least one line item are required.', 'error');
                return;
            }
            const orders = getStoredPurchaseOrders();
            const newOrder = {
                id: poNumber,
                supplier,
                eta,
                value,
                currency,
                status,
                notes,
                items,
                createdAt: new Date().toISOString()
            };
            const existingIndex = orders.findIndex(order => order.id === poNumber);
            if (existingIndex >= 0) {
                orders[existingIndex] = newOrder;
            } else {
                orders.unshift(newOrder);
            }
            savePurchaseOrders(orders);
            renderPurchaseOrders();
            renderSupplierScorecard();
            renderPlanInsights();
            clearPurchaseOrderForm();
            notifyStock('Purchase order saved locally.', 'success');
        }
        window.handlePurchaseOrderSubmit = handlePurchaseOrderSubmit;

        function renderPurchaseOrders() {
            const container = document.getElementById('purchaseOrderList');
            if (!container) return;
            const orders = getStoredPurchaseOrders();
            if (!orders.length) {
                container.innerHTML = '<div class="hub-activity-empty">No purchase orders yet. Create one to get started.</div>';
                updateStockOverviewMetrics({ orders, forecasts: getStockForecastData() });
                return;
            }
            container.innerHTML = orders.map(order => {
                const itemsHtml = order.items?.slice(0, 4).map(item => `
                    <li style="display:flex; justify-content:space-between;">
                        <span>${sanitizeInputValue(item.description)}</span>
                        <span style="font-weight:600;">${item.quantity || 0} pcs</span>
                    </li>
                `).join('') || '<li>No line items captured.</li>';
                const statusClass = (order.status || 'open').toLowerCase();
                return `
                    <article class="hub-card hub-card--surface" style="border:1px solid rgba(15,23,42,0.08);">
                        <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div>
                                <strong>${sanitizeInputValue(order.id)}</strong>
                                <div style="color:#64748b; font-size:0.9rem;">${sanitizeInputValue(order.supplier)}</div>
                            </div>
                            <span class="status-chip status-${statusClass}" style="padding:4px 10px; border-radius:999px; font-size:0.85rem; text-transform:capitalize; background:#f1f5f9;">
                                ${sanitizeInputValue(order.status || 'Open')}
                            </span>
                        </header>
                        <dl style="display:grid; grid-template-columns: repeat(auto-fit,minmax(120px,1fr)); gap:6px; font-size:0.85rem; color:#475569; margin-bottom:10px;">
                            <div><dt style="text-transform:uppercase; font-size:0.7rem; color:#94a3b8;">ETA</dt><dd style="margin:0; font-weight:600;">${order.eta || 'TBC'}</dd></div>
                            <div><dt style="text-transform:uppercase; font-size:0.7rem; color:#94a3b8;">Value</dt><dd style="margin:0; font-weight:600;">${formatCurrency(order.value, order.currency || 'N$')}</dd></div>
                            <div><dt style="text-transform:uppercase; font-size:0.7rem; color:#94a3b8;">Lines</dt><dd style="margin:0; font-weight:600;">${order.items?.length || 0}</dd></div>
                        </dl>
                        <ul style="margin:0; padding-left:16px; color:#475569; font-size:0.9rem;">${itemsHtml}</ul>
                    </article>
                `;
            }).join('');
            updateStockOverviewMetrics({ orders, forecasts: getStockForecastData() });
        }
        window.renderPurchaseOrders = renderPurchaseOrders;

        function exportPurchaseOrders() {
            const orders = getStoredPurchaseOrders();
            if (!orders.length) {
                notifyStock('There are no purchase orders to export.', 'warning');
                return;
            }
            const headers = ['PO Number', 'Supplier', 'ETA', 'Status', 'Value', 'Currency', 'Items'];
            const rows = orders.map(order => {
                const lineSummary = (order.items || []).map(item => `${item.description} (${item.quantity})`).join('; ');
                return [
                    order.id,
                    order.supplier,
                    order.eta,
                    order.status,
                    order.value,
                    order.currency,
                    lineSummary
                ];
            });
            const csv = [headers, ...rows].map(row => row.map(value => {
                const cell = value === undefined || value === null ? '' : String(value);
                return `"${cell.replace(/"/g, '""')}"`;
            }).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `purchase-orders-${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            notifyStock('Purchase orders exported.', 'success');
        }
        window.exportPurchaseOrders = exportPurchaseOrders;

        function renderForecastList() {
            const list = document.getElementById('planInsights');
            if (!list) return;
            const forecasts = getStockForecastData();
            if (!forecasts.length) {
                list.innerHTML = '<li>No forecast data available yet.</li>';
                updateStockOverviewMetrics({ orders: getStoredPurchaseOrders(), forecasts });
                return;
            }
            list.innerHTML = forecasts.map(item => {
                const badgeColor = (item.action || '').toLowerCase() === 'healthy' ? '#10b981' : (item.action || '').toLowerCase() === 'monitor' ? '#f59e0b' : '#ef4444';
                return `
                    <li style="margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:600;">${sanitizeInputValue(item.product)}</span>
                            <span style="padding:2px 8px; border-radius:999px; font-size:0.8rem; background:${badgeColor}; color:white;">${sanitizeInputValue(item.action)}</span>
                        </div>
                        <div style="font-size:0.85rem; color:#64748b;">
                            Demand: ${item.demand || 0} / month • Coverage: ${item.coverageDays || 0} days • Risk: ${item.risk || 'N/A'}
                        </div>
                    </li>
                `;
            }).join('');
            updateStockOverviewMetrics({ orders: getStoredPurchaseOrders(), forecasts });
        }
        window.renderForecastList = renderForecastList;

        function renderPlanInsights() {
            renderForecastList();
        }
        window.renderPlanInsights = renderPlanInsights;

        function renderSupplierScorecard() {
            const container = document.getElementById('supplierScorecard');
            if (!container) return;
            const orders = getStoredPurchaseOrders();
            if (!orders.length) {
                const defaults = getStockStorageValue(STOCK_STORAGE_KEYS.supplierScores, DEFAULT_SUPPLIER_SCORES);
                if (!defaults.length) {
                    container.innerHTML = '<div class="hub-activity-empty">Supplier scorecard will appear once purchase orders are captured.</div>';
                    return;
                }
                container.innerHTML = buildSupplierScorecardTable(defaults);
                return;
            }
            const metricsMap = {};
            orders.forEach(order => {
                const supplier = order.supplier || 'Unknown Supplier';
                if (!metricsMap[supplier]) {
                    metricsMap[supplier] = { supplier, delivered: 0, total: 0, totalValue: 0, leadTimes: [], openOrders: 0 };
                }
                const metric = metricsMap[supplier];
                metric.total += 1;
                metric.totalValue += Number(order.value || 0);
                metric.openOrders += (order.status || '').toLowerCase() === 'delivered' ? 0 : 1;
                if ((order.status || '').toLowerCase() === 'delivered') {
                    metric.delivered += 1;
                }
                if (order.eta && order.createdAt) {
                    const eta = new Date(order.eta);
                    const created = new Date(order.createdAt);
                    const leadTime = Math.max(1, Math.round((eta - created) / (1000 * 60 * 60 * 24)));
                    if (isFinite(leadTime)) {
                        metric.leadTimes.push(leadTime);
                    }
                }
            });
            const metrics = Object.values(metricsMap).map(entry => ({
                supplier: entry.supplier,
                otif: entry.total ? Math.round((entry.delivered / entry.total) * 100) : 0,
                avgLeadTime: entry.leadTimes.length ? Math.round(entry.leadTimes.reduce((a, b) => a + b, 0) / entry.leadTimes.length) : 30,
                openOrders: entry.openOrders,
                totalValue: entry.totalValue
            }));
            setStockStorageValue(STOCK_STORAGE_KEYS.supplierScores, metrics);
            container.innerHTML = buildSupplierScorecardTable(metrics);
        }
        window.renderSupplierScorecard = renderSupplierScorecard;

        function buildSupplierScorecardTable(metrics) {
            if (!metrics.length) {
                return '<div class="hub-activity-empty">No supplier insights available.</div>';
            }
            const rows = metrics.map(metric => `
                <tr>
                    <td>${sanitizeInputValue(metric.supplier)}</td>
                    <td style="text-align:center;">${metric.otif}%</td>
                    <td style="text-align:center;">${metric.avgLeadTime} days</td>
                    <td style="text-align:center;">${metric.openOrders}</td>
                    <td style="text-align:right;">${formatCurrency(metric.totalValue)}</td>
                </tr>
            `).join('');
            return `
                <table class="hub-table" style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="text-align:left; padding:8px;">Supplier</th>
                            <th style="text-align:center; padding:8px;">OTIF %</th>
                            <th style="text-align:center; padding:8px;">Avg Lead Time</th>
                            <th style="text-align:center; padding:8px;">Open Orders</th>
                            <th style="text-align:right; padding:8px;">Total Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        document.addEventListener('DOMContentLoaded', () => {
            try {
                renderPurchaseOrders();
                renderPlanInsights();
                renderSupplierScorecard();
            } catch (error) {
            }
        });
        
        function extractArray(data, fallback = []) {
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.data)) return data.data;
            if (data && Array.isArray(data.items)) return data.items;
            if (data && Array.isArray(data.results)) return data.results;
            return Array.isArray(fallback) ? fallback : [];
        }
        
        function updateNavigationForUser(user, role) {
            const navLoginSection = document.getElementById('navLoginSection');
            const navUserSection = document.getElementById('navUserSection');
            const navUserDisplay = document.getElementById('navUserDisplay');
            
            if (navLoginSection) navLoginSection.style.display = 'none';
            if (navUserSection) navUserSection.style.display = 'flex';
            if (navUserDisplay && user) {
                navUserDisplay.textContent = `${user.fullName || user.username} (${role})`;
            }
            var publicLinks = document.querySelectorAll('#desktopNavLinks > a');
            publicLinks.forEach(function(link) {
                var text = link.textContent.trim().toLowerCase();
                if (text === 'shop' || text === 'health check') {
                    link.style.display = 'none';
                }
            });
            var mobileLinks = document.querySelectorAll('#mobileMenu > a');
            mobileLinks.forEach(function(link) {
                var text = link.textContent.trim().toLowerCase();
                if (text === 'shop' || text === 'health check') {
                    link.style.display = 'none';
                }
            });
        }
        
        // Landing Page Tab Functions
        (function handleHashNavigation() {
            function routeByHash() {
                // Never redirect to landing page if a user is already authenticated
                if (window.currentUser && window.currentUser.role) return;
                var hash = window.location.hash;
                if (hash === '#client' || hash === '#shop') {
                    showLandingPage();
                    showLandingTab('shop');
                } else if (hash === '#checkup') {
                    showLandingPage();
                    showLandingTab('checkup');
                    enterCheckupMode();
                } else if (hash === '#testimonials') {
                    showLandingPage();
                    showLandingTab('shop');
                }
                if (sessionStorage.getItem('dynapharm_open_staff_login') === '1') {
                    sessionStorage.removeItem('dynapharm_open_staff_login');
                    var landingPage = document.getElementById('landingPage');
                    if (landingPage) landingPage.style.display = 'none';
                    function openStaffLoginWhenReady() {
                        if (document.getElementById('loginModal') && typeof showStaffLogin === 'function') {
                            showStaffLogin();
                        } else {
                            setTimeout(openStaffLoginWhenReady, 300);
                        }
                    }
                    if (window.functionsLoaded) {
                        openStaffLoginWhenReady();
                    } else {
                        window.addEventListener('functionsReady', openStaffLoginWhenReady);
                        setTimeout(openStaffLoginWhenReady, 3000);
                    }
                }
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { setTimeout(routeByHash, 300); });
            } else {
                setTimeout(routeByHash, 300);
            }
            window.addEventListener('hashchange', routeByHash);
        })();

        function showLandingTab(tabName) {
            const shopTab = document.getElementById('landingTabShop');
            const checkupTab = document.getElementById('landingTabCheckup');
            const shopContent = document.getElementById('landingTabShopContent');
            const checkupContent = document.getElementById('landingTabCheckupContent');
            
            if (tabName === 'shop') {
                if (shopTab) {
                    shopTab.style.background = '#c41e3a';
                    shopTab.style.color = 'white';
                }
                if (checkupTab) {
                    checkupTab.style.background = '#f0f0f0';
                    checkupTab.style.color = '#666';
                }
                if (shopContent) shopContent.style.display = 'block';
                if (checkupContent) checkupContent.style.display = 'none';
            } else if (tabName === 'checkup') {
                if (shopTab) {
                    shopTab.style.background = '#f0f0f0';
                    shopTab.style.color = '#666';
                }
                if (checkupTab) {
                    checkupTab.style.background = '#c41e3a';
                    checkupTab.style.color = 'white';
                }
                if (shopContent) shopContent.style.display = 'none';
                if (checkupContent) {
                    checkupContent.style.display = 'block';
                    populateLandingBranchSelect();
                    if (typeof loadBranches === 'function') loadBranches();
                    var chkDateEl = document.getElementById('chkApptDate');
                    if (chkDateEl) chkDateEl.min = new Date().toISOString().split('T')[0];
                }
            }
        }
        
        function populateLandingBranchSelect() {
            const branchSelect = document.getElementById('landingCheckupBranchSelect');
            const bindSelectHandler = (select) => {
                if (!select) return;
                select.onchange = function(e) {
                    const value = e.target.value || '';
                    if (value) {
                        currentBranch = value;
                    }
                    const checkSelect = document.getElementById('checkupBranchSelect');
                    if (checkSelect && checkSelect.value !== value) {
                        checkSelect.value = value;
                    }
                    const preferredSelect = document.getElementById('preferredBranchSelect');
                    if (preferredSelect && preferredSelect.value !== value) {
                        preferredSelect.value = value;
                    }
                };
            };
            if (branchSelect && branches && branches.length > 0) {
                branchSelect.innerHTML = '<option value="">Select Branch</option>';
                branchList.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.id || branch.name;
                    option.textContent = branch.name || branch.id;
                    branchSelect.appendChild(option);
                });
                if (currentBranch && !branchSelect.value) {
                    branchSelect.value = currentBranch;
                }
                bindSelectHandler(branchSelect);
            } else if (branchSelect) {
                // Load branches if not already loaded
                loadData().then(() => {
                    if (branches && branches.length > 0) {
                        branchSelect.innerHTML = '<option value="">Select Branch</option>';
                        branchList.forEach(branch => {
                            const option = document.createElement('option');
                            option.value = branch.id || branch.name;
                            option.textContent = branch.name || branch.id;
                            branchSelect.appendChild(option);
                        });
                        if (currentBranch && !branchSelect.value) {
                            branchSelect.value = currentBranch;
                        }
                        bindSelectHandler(branchSelect);
                    }
                });
            }
        }
        
        // Navigation functions
        function showGuestPortal() {
//             showLandingPage();
            // Show shop tab by default
            showLandingTab('shop');
            // Scroll to shop section
            const shopSection = document.getElementById('landingShopProductsGrid');
            if (shopSection) {
                shopSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
        
        function showAboutUs() {
            // TODO: Implement About Us section
            alert('About Us section coming soon!');
        }
        
        function showMedia() {
//             showLandingPage();
            showLandingTab('shop');
            setTimeout(() => {
                if (typeof loadMediaPreviewWidget === 'function') {
                    loadMediaPreviewWidget().catch(() => {});
                }
                if (typeof openMediaOverlay === 'function') {
                    openMediaOverlay();
                } else {
                    const widget = document.getElementById('mediaPreviewWidget');
                    if (widget) {
                        widget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, 150);
        }
        
        function setCheckupClientType(type) {
            document.getElementById('chkClientType').value = type;
            var refBtn = document.getElementById('chkClientTypeReferred');
            var memBtn = document.getElementById('chkClientTypeMember');
            var section = document.getElementById('chkReferralSection');
            var step2Label = document.getElementById('chkStep2Label');
            var step2Title = document.getElementById('chkStep2Title');
            var refLabel = document.getElementById('chkReferralLabel');
            var searchLabel = document.getElementById('chkDistributorSearchLabel');
            var infoBox = document.getElementById('chkClientTypeInfo');
            var nameInput = document.getElementById('chkDistributorName');
            var nbInput = document.getElementById('chkDistributorNB');
            var statusEl = document.getElementById('chkDistributorStatus');
            var badge = document.getElementById('chkPersonalAutoFillBadge');

            // Clear search fields
            if (nameInput) nameInput.value = '';
            if (nbInput) nbInput.value = '';
            if (statusEl) { statusEl.textContent = ''; statusEl.style.color = '#666'; }
            var dd = document.getElementById('chkDistributorDropdown');
            if (dd) dd.style.display = 'none';

            // Clear any previous auto-fill on personal info
            _clearCheckupAutoFill();

            if (type === 'member') {
                // Highlight Member button
                memBtn.style.background = 'white'; memBtn.style.color = '#c41e3a';
                refBtn.style.background = 'rgba(255,255,255,0.15)'; refBtn.style.color = 'white';

                // Switch Step 2 section to member/green style
                section.style.background = '#f0fdf4';
                section.style.borderColor = '#16a34a';
                if (step2Label) { step2Label.textContent = 'Step 2 — Member Lookup'; step2Label.style.color = '#15803d'; }
                if (step2Title) { step2Title.textContent = 'Find Your Member Record'; step2Title.style.color = '#14532d'; }
                if (refLabel) { refLabel.textContent = 'Search by your name or NB number. Your personal details will be filled in automatically.'; refLabel.style.color = '#166534'; }
                if (searchLabel) { searchLabel.textContent = 'Your Name or NB Number *'; searchLabel.style.color = '#15803d'; }
                if (nameInput) { nameInput.style.borderColor = '#16a34a'; nameInput.placeholder = 'Type your name or NB number to search...'; }
                if (nbInput) { nbInput.style.borderColor = '#bbf7d0'; nbInput.style.background = '#dcfce7'; nbInput.style.color = '#14532d'; }
                if (infoBox) infoBox.innerHTML = '<strong>Member rate</strong> applies — search for your member record above and your details will be populated automatically.';
                if (badge) badge.style.display = 'none';
            } else {
                // Highlight Referred button
                refBtn.style.background = 'white'; refBtn.style.color = '#c41e3a';
                memBtn.style.background = 'rgba(255,255,255,0.15)'; memBtn.style.color = 'white';

                // Switch Step 2 section back to referred/blue style
                section.style.background = '#eff6ff';
                section.style.borderColor = '#3b82f6';
                if (step2Label) { step2Label.textContent = 'Step 2 — Referral'; step2Label.style.color = '#1d4ed8'; }
                if (step2Title) { step2Title.textContent = 'Who Referred You?'; step2Title.style.color = '#1e3a8a'; }
                if (refLabel) { refLabel.textContent = 'Search for the Dynapharm member or distributor who referred you by name or NB number.'; refLabel.style.color = '#1e40af'; }
                if (searchLabel) { searchLabel.textContent = 'Referring Distributor Name or NB Number *'; searchLabel.style.color = '#1d4ed8'; }
                if (nameInput) { nameInput.style.borderColor = '#3b82f6'; nameInput.placeholder = 'Type distributor name or NB number...'; }
                if (nbInput) { nbInput.style.borderColor = '#bfdbfe'; nbInput.style.background = '#dbeafe'; nbInput.style.color = '#1e3a8a'; }
                if (infoBox) infoBox.innerHTML = '<strong>Referred rate</strong> applies — please enter your personal details below and name the distributor who referred you.';
                if (badge) badge.style.display = 'none';
            }
        }

        function _clearCheckupAutoFill() {
            var fields = ['chkFullName', 'chkPhone', 'chkEmail', 'chkGender', 'chkDOB'];
            fields.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.readOnly = false;
                    el.disabled = false;
                    el.style.background = '';
                    el.style.borderColor = '';
                }
            });
            var badge = document.getElementById('chkPersonalAutoFillBadge');
            if (badge) badge.style.display = 'none';
        }

        function _applyCheckupMemberAutoFill(d) {
            var nameEl = document.getElementById('chkFullName');
            var phoneEl = document.getElementById('chkPhone');
            var emailEl = document.getElementById('chkEmail');
            var genderEl = document.getElementById('chkGender');
            var dobEl = document.getElementById('chkDOB');
            var badge = document.getElementById('chkPersonalAutoFillBadge');

            if (nameEl && d.name) { nameEl.value = d.name; nameEl.readOnly = true; nameEl.style.background = '#f0fdf4'; nameEl.style.borderColor = '#86efac'; }
            if (phoneEl && d.phone) { phoneEl.value = d.phone; phoneEl.readOnly = true; phoneEl.style.background = '#f0fdf4'; phoneEl.style.borderColor = '#86efac'; }
            if (emailEl && d.email) { emailEl.value = d.email; emailEl.readOnly = true; emailEl.style.background = '#f0fdf4'; emailEl.style.borderColor = '#86efac'; }
            if (genderEl && d.gender) {
                var gVal = (d.gender || '').toLowerCase();
                if (gVal === 'male' || gVal === 'female') { genderEl.value = gVal; genderEl.disabled = true; genderEl.style.background = '#f0fdf4'; genderEl.style.borderColor = '#86efac'; }
            }
            if (dobEl && d.dob) { dobEl.value = d.dob; dobEl.readOnly = true; dobEl.style.background = '#f0fdf4'; dobEl.style.borderColor = '#86efac'; }

            // Show auto-fill badge
            if (badge) badge.style.display = 'inline-block';
        }

        var _allCheckupDistributors = [];
        var _checkupDistributorsLoaded = false;
        var _checkupDistributorsLoading = false;

        function _parseDistributorCSV(text) {
            var lines = text.split('\n').filter(function(l) { return l.trim(); });
            if (lines.length < 2) return [];
            var firstLine = lines[0];
            var delimiter = ',';
            if (firstLine.indexOf('\t') !== -1) delimiter = '\t';
            else if (firstLine.indexOf(';') !== -1) delimiter = ';';
            var headers = lines[0].split(delimiter).map(function(h) { return h.trim().toUpperCase().replace(/"/g, ''); });
            var drnIdx = -1, nameIdx = -1;
            for (var hi = 0; hi < headers.length; hi++) {
                if (headers[hi] === 'DRN' || headers[hi] === 'DNR' || headers[hi] === 'DISTRIBUTORCODE' || headers[hi] === 'CODE') drnIdx = hi;
                if (headers[hi] === 'NAME' || headers[hi] === 'DISTRIBUTORNAME' || headers[hi] === 'DISTRIBUTOR NAME') nameIdx = hi;
            }
            if (drnIdx === -1 || nameIdx === -1) return [];
            var result = [];
            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(delimiter).map(function(v) { return v.trim().replace(/"/g, ''); });
                if (values.length > Math.max(drnIdx, nameIdx)) {
                    var drn = values[drnIdx] || '';
                    var nm = values[nameIdx] || '';
                    if (drn && nm) {
                        result.push({ code: drn.toUpperCase().trim(), name: nm.trim() });
                    }
                }
            }
            return result;
        }

        async function _loadAllCheckupDistributors() {
            if (_checkupDistributorsLoaded && _allCheckupDistributors.length > 0) return _allCheckupDistributors;
            if (_checkupDistributorsLoading) {
                return new Promise(function(resolve) {
                    var check = setInterval(function() {
                        if (!_checkupDistributorsLoading) { clearInterval(check); resolve(_allCheckupDistributors); }
                    }, 100);
                });
            }
            _checkupDistributorsLoading = true;
            var distributors = [];
            try {
                var apiRes = await fetch('/api/distributors');
                if (apiRes.ok) {
                    var apiData = await apiRes.json();
                    if (Array.isArray(apiData) && apiData.length > 0) {
                        apiData.forEach(function(d) {
                            var c = (d.distributor_code || d.distributorCode || d.code || '').toUpperCase().trim();
                            var n = (d.distributor_name || d.distributorName || d.name || '').trim();
                            if (c && n && d.entity_type !== 'branch') distributors.push({ code: c, name: n,
                                phone: d.mobile_no || d.mobileNo || d.phone || '',
                                email: d.email || '', gender: d.gender || '', dob: d.dob || d.date_of_birth || ''
                            });
                        });
                    }
                }
            } catch(e) {}
            try {
                var cached = localStorage.getItem('dyna_distributors_cache');
                if (cached) {
                    var parsed = JSON.parse(cached);
                    if (parsed.data && parsed.data.length > 0) {
                        var existing = {};
                        distributors.forEach(function(d) { existing[d.code] = true; });
                        parsed.data.forEach(function(d) {
                            var c = (d.distributorCode || d.code || d.distributor_code || '').toUpperCase().trim();
                            var n = (d.distributorName || d.name || d.distributor_name || '').trim();
                            if (c && n && !existing[c]) {
                                distributors.push({ code: c, name: n,
                                    phone: d.mobileNo || d.mobile_no || d.phone || '',
                                    email: d.email || '', gender: d.gender || '', dob: d.dob || d.date_of_birth || ''
                                });
                                existing[c] = true;
                            }
                        });
                    }
                }
            } catch(e) {}
            try {
                var stored = localStorage.getItem('dyna_distributors');
                if (stored) {
                    var lsData = JSON.parse(stored);
                    if (Array.isArray(lsData) && lsData.length > 0) {
                        var existing2 = {};
                        distributors.forEach(function(d) { existing2[d.code] = true; });
                        lsData.forEach(function(d) {
                            var c = (d.distributorCode || d.code || d.distributor_code || '').toUpperCase().trim();
                            var n = (d.distributorName || d.name || d.distributor_name || '').trim();
                            if (c && n && !existing2[c]) {
                                distributors.push({ code: c, name: n,
                                    phone: d.mobileNo || d.mobile_no || d.phone || '',
                                    email: d.email || '', gender: d.gender || '', dob: d.dob || d.date_of_birth || ''
                                });
                                existing2[c] = true;
                            }
                        });
                    }
                }
            } catch(e) {}
            try {
                var idbDist = await new Promise(function(resolve) {
                    var req = indexedDB.open('DynapharmDB', 1);
                    req.onerror = function() { resolve([]); };
                    req.onupgradeneeded = function(ev) {
                        var db = ev.target.result;
                        if (!db.objectStoreNames.contains('distributors')) {
                            db.createObjectStore('distributors', { keyPath: 'id' });
                        }
                    };
                    req.onsuccess = function() {
                        var db = req.result;
                        if (!db.objectStoreNames.contains('distributors')) { resolve([]); return; }
                        try {
                            var tx = db.transaction(['distributors'], 'readonly');
                            var store = tx.objectStore('distributors');
                            var getAll = store.getAll();
                            getAll.onsuccess = function() { resolve(getAll.result || []); };
                            getAll.onerror = function() { resolve([]); };
                        } catch(e) { resolve([]); }
                    };
                });
                if (idbDist.length > 0) {
                    var existing3 = {};
                    distributors.forEach(function(d) { existing3[d.code] = true; });
                    idbDist.forEach(function(d) {
                        var c = (d.distributorCode || d.code || d.distributor_code || '').toUpperCase().trim();
                        var n = (d.distributorName || d.name || d.distributor_name || '').trim();
                        if (c && n && !existing3[c]) { distributors.push({ code: c, name: n }); existing3[c] = true; }
                    });
                }
            } catch(e) {}
            if (distributors.length < 100) {
                try {
                    var csvFiles = ['sample-distributor-comma.csv', 'sample-distributor.csv'];
                    for (var fi = 0; fi < csvFiles.length; fi++) {
                        try {
                            var csvRes = await fetch(csvFiles[fi]);
                            if (csvRes.ok) {
                                var csvText = await csvRes.text();
                                var csvDist = _parseDistributorCSV(csvText);
                                if (csvDist.length > 0) {
                                    var existing4 = {};
                                    distributors.forEach(function(d) { existing4[d.code] = true; });
                                    csvDist.forEach(function(d) {
                                        if (!existing4[d.code]) { distributors.push(d); existing4[d.code] = true; }
                                    });
                                    break;
                                }
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
            _allCheckupDistributors = distributors;
            _checkupDistributorsLoaded = distributors.length > 0;
            _checkupDistributorsLoading = false;
            return distributors;
        }

        function _filterDistributors(query) {
            var q = query.toLowerCase();
            var results = [];
            for (var i = 0; i < _allCheckupDistributors.length && results.length < 20; i++) {
                var d = _allCheckupDistributors[i];
                if (d.name.toLowerCase().indexOf(q) !== -1 || d.code.toLowerCase().indexOf(q) !== -1) {
                    results.push(d);
                }
            }
            return results;
        }

        function _renderDistributorDropdown(list, dropdownId, onSelect) {
            var dd = document.getElementById(dropdownId);
            if (!dd) return;
            dd.textContent = '';
            if (list.length === 0) {
                var emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'padding:12px; color:#999; font-size:0.9rem;';
                emptyDiv.textContent = 'No distributors found';
                dd.appendChild(emptyDiv);
                dd.style.display = 'block';
                return;
            }
            list.forEach(function(d) {
                var item = document.createElement('div');
                item.style.cssText = 'padding:10px 14px; cursor:pointer; border-bottom:1px solid #f0f0f0; font-size:0.9rem; transition: background 0.15s;';
                var strong = document.createElement('strong');
                strong.textContent = d.name;
                var span = document.createElement('span');
                span.style.cssText = 'color:#666; font-size:0.8rem; margin-left:6px;';
                span.textContent = '(' + d.code + ')';
                item.appendChild(strong);
                item.appendChild(span);
                item.onmouseenter = function() { this.style.background = '#f3f4f6'; };
                item.onmouseleave = function() { this.style.background = 'white'; };
                item.onclick = function() { onSelect(d); dd.style.display = 'none'; };
                dd.appendChild(item);
            });
            dd.style.display = 'block';
        }

        var chkDistSearchTimer = null;
        function initCheckupDistributorSearch() {
            var input = document.getElementById('chkDistributorName');
            if (!input) return;
            _loadAllCheckupDistributors();
            input.addEventListener('input', function() {
                clearTimeout(chkDistSearchTimer);
                var q = this.value.trim();
                if (q.length < 2) {
                    document.getElementById('chkDistributorDropdown').style.display = 'none';
                    return;
                }
                document.getElementById('chkDistributorNB').value = '';
                document.getElementById('chkDistributorStatus').textContent = '';
                chkDistSearchTimer = setTimeout(async function() {
                    if (!_checkupDistributorsLoaded) await _loadAllCheckupDistributors();
                    var list = _filterDistributors(q);
                    _renderDistributorDropdown(list, 'chkDistributorDropdown', function(d) {
                        document.getElementById('chkDistributorName').value = d.name;
                        document.getElementById('chkDistributorNB').value = d.code;
                        var statusEl = document.getElementById('chkDistributorStatus');
                        var clientType = (document.getElementById('chkClientType') || {}).value || 'referred';
                        if (clientType === 'member') {
                            statusEl.style.color = '#15803d';
                            statusEl.textContent = '\u2705 Member record found: ' + d.name + ' (' + d.code + ') \u2014 details filled in below';
                            _applyCheckupMemberAutoFill(d);
                        } else {
                            statusEl.style.color = '#1d4ed8';
                            statusEl.textContent = 'Referral confirmed: ' + d.name + ' (' + d.code + ')';
                        }
                    });
                }, 200);
            });
            document.addEventListener('click', function(e) {
                if (!e.target.closest('#chkDistributorDropdown') && e.target.id !== 'chkDistributorName') {
                    document.getElementById('chkDistributorDropdown').style.display = 'none';
                }
            });
        }

        var clientRefSearchTimer = null;
        function searchDistributorsForClientReferral() {
            clearTimeout(clientRefSearchTimer);
            var input = document.getElementById('clientReferralName');
            if (!input) return;
            var q = input.value.trim();
            if (q.length < 2) {
                document.getElementById('clientReferralDropdown').style.display = 'none';
                return;
            }
            document.getElementById('clientReferralNB').value = '';
            clientRefSearchTimer = setTimeout(async function() {
                if (!_checkupDistributorsLoaded) await _loadAllCheckupDistributors();
                var list = _filterDistributors(q);
                _renderDistributorDropdown(list, 'clientReferralDropdown', function(d) {
                    document.getElementById('clientReferralName').value = d.name;
                    document.getElementById('clientReferralNB').value = d.code;
                    var statusEl = document.getElementById('clientReferralStatus');
                    if (statusEl) { statusEl.textContent = 'Selected: ' + d.name + ' (' + d.code + ')'; statusEl.style.color = '#059669'; }
                });
            }, 200);
        }

        var distRefSearchTimer = null;
        function searchDistributorsForReferral() {
            clearTimeout(distRefSearchTimer);
            var input = document.getElementById('distributorReferralSearch');
            if (!input) return;
            var q = input.value.trim();
            if (q.length < 2) {
                document.getElementById('distributorReferralDropdown').style.display = 'none';
                return;
            }
            document.getElementById('distributorReferralValue').value = '';
            distRefSearchTimer = setTimeout(async function() {
                var currentVal = document.getElementById('distributorReferralSearch').value.trim();
                if (currentVal !== q) return;
                if (!_checkupDistributorsLoaded) await _loadAllCheckupDistributors();
                var list = _filterDistributors(q);
                _renderDistributorDropdown(list, 'distributorReferralDropdown', function(d) {
                    document.getElementById('distributorReferralSearch').value = d.name + ' (' + d.code + ')';
                    document.getElementById('distributorReferralValue').value = d.code;
                });
            }, 200);
        }

        function _escHtml(str) {
            var d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function _getCheckupInitials(name) {
            if (!name) return '';
            var parts = name.trim().split(/\s+/);
            var initials = '';
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].length > 0) initials += parts[i][0].toUpperCase();
            }
            return initials;
        }
        function _isCheckupAcknowledged() {
            var cb = document.getElementById('chkAcknowledge');
            return cb && cb.checked;
        }

        function _getCheckupFormData() {
            var visitType = (document.getElementById('checkupVisitType') || {}).value || 'appointment';
            var fullName = (document.getElementById('chkFullName') || {}).value || '';
            var phone = (document.getElementById('chkPhone') || {}).value || '';
            var email = (document.getElementById('chkEmail') || {}).value || '';
            var gender = (document.getElementById('chkGender') || {}).value || '';
            var dob = (document.getElementById('chkDOB') || {}).value || '';
            var branch = (document.getElementById('chkBranch') || {});
            var branchText = branch.options ? (branch.options[branch.selectedIndex] || {}).text || '' : '';
            var branchVal = branch.value || '';
            var apptDate = (document.getElementById('chkApptDate') || {}).value || '';
            var apptTime = (document.getElementById('chkApptTime') || {}).value || '';
            var clientType = (document.getElementById('chkClientType') || {}).value || 'referred';
            var distName = (document.getElementById('chkDistributorName') || {}).value || '';
            var distNB = (document.getElementById('chkDistributorNB') || {}).value || '';
            var concern = (document.getElementById('chkConcern') || {}).value || '';
            var condEls = document.querySelectorAll('input[name="chkConditions"]:checked');
            var condArr = [];
            condEls.forEach(function(el) {
                var label = el.parentElement ? el.parentElement.textContent.trim() : el.value;
                condArr.push(label);
            });
            var conditions = condArr.join(', ');
            var medications = (document.getElementById('chkMedications') || {}).value || '';
            var notes = (document.getElementById('chkNotes') || {}).value || '';
            return {
                visitType: visitType === 'walkin' ? 'Walk-in' : 'Book Appointment',
                fullName: fullName, phone: phone, email: email,
                gender: gender, dob: dob, branch: branchText || branchVal,
                apptDate: apptDate, apptTime: apptTime,
                clientType: clientType === 'member' ? 'I am a Member' : 'Referred by a Distributor',
                distributorName: distName, distributorNB: distNB,
                concern: concern, conditions: conditions,
                medications: medications, notes: notes,
                acknowledged: _isCheckupAcknowledged(),
                acknowledgedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
                initials: _getCheckupInitials(fullName)
            };
        }

        function _buildCheckupPreviewHTML(data) {
            var logoUrl = window.location.origin + '/assets/dynapharm-logo.png';
            var now = new Date();
            var dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
            var timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            var e = _escHtml;
            var html = '<div id="checkupPrintArea">';
            html += '<style>@media print { body * { visibility: hidden; } #checkupPrintArea, #checkupPrintArea * { visibility: visible; } #checkupPrintArea { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; } }</style>';
            html += '<div style="text-align:center; margin-bottom:20px; border-bottom:3px solid #c41e3a; padding-bottom:16px;">';
            html += '<img src="' + logoUrl + '" alt="Dynapharm Namibia" style="width:90px; height:auto; margin-bottom:8px;">';
            html += '<h2 style="margin:0 0 4px; color:#c41e3a; font-size:1.4rem;">Dynapharm International Namibia</h2>';
            html += '<h3 style="margin:0 0 4px; color:#1f2937; font-size:1.1rem;">Full Body Check Up Form</h3>';
            html += '<p style="margin:0; color:#6b7280; font-size:0.85rem;">' + e(dateStr) + ' at ' + e(timeStr) + '</p>';
            html += '</div>';

            html += '<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">';
            function row(label, value) {
                if (!value) return '';
                return '<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600; color:#374151; width:40%; background:#f9fafb;">' + e(label) + '</td><td style="padding:8px 12px; border:1px solid #e5e7eb; color:#1f2937;">' + e(value) + '</td></tr>';
            }

            html += '<tr><td colspan="2" style="padding:10px 12px; background:#c41e3a; color:white; font-weight:700; font-size:0.95rem;">Visit Information</td></tr>';
            html += row('Visit Type', data.visitType);
            if (data.apptDate) html += row('Appointment Date', data.apptDate);
            if (data.apptTime) html += row('Appointment Time', data.apptTime);
            html += row('Branch', data.branch);

            html += '<tr><td colspan="2" style="padding:10px 12px; background:#c41e3a; color:white; font-weight:700; font-size:0.95rem;">Personal Information</td></tr>';
            html += row('Full Name', data.fullName);
            html += row('Phone', data.phone);
            if (data.email) html += row('Email', data.email);
            html += row('Gender', data.gender);
            if (data.dob) html += row('Date of Birth', data.dob);

            html += '<tr><td colspan="2" style="padding:10px 12px; background:#c41e3a; color:white; font-weight:700; font-size:0.95rem;">Referral / Membership</td></tr>';
            html += row('Type', data.clientType);
            if (data.distributorName) html += row('Distributor Name', data.distributorName);
            if (data.distributorNB) html += row('NB Number', data.distributorNB);

            html += '<tr><td colspan="2" style="padding:10px 12px; background:#c41e3a; color:white; font-weight:700; font-size:0.95rem;">Health Information</td></tr>';
            html += row('Primary Concern', data.concern);
            if (data.conditions) html += row('Existing Conditions', data.conditions);
            if (data.medications) html += row('Current Medications', data.medications);
            if (data.notes) html += row('Additional Notes', data.notes);

            html += '</table>';

            if (data.acknowledged) {
                html += '<div style="margin-top:24px; padding:16px; background:#f0fdf4; border:2px solid #22c55e; border-radius:10px;">';
                html += '<p style="margin:0 0 8px; font-weight:700; color:#166534; font-size:0.95rem;">Declaration</p>';
                html += '<p style="margin:0 0 12px; font-size:0.85rem; color:#374151;">I hereby confirm that all information provided is true and correct to the best of my knowledge.</p>';
                html += '<div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:16px; flex-wrap:wrap; gap:16px;">';
                html += '<div style="flex:1; min-width:140px;"><div style="font-weight:700; font-size:1rem; color:#1f2937; margin-bottom:4px;">' + e(data.fullName) + '</div>';
                html += '<div style="font-size:0.8rem; color:#6b7280;">Initials: <strong>' + e(data.initials) + '</strong></div>';
                html += '<div style="border-top:1px solid #374151; margin-top:6px; padding-top:4px; font-size:0.8rem; color:#374151;">Client Name &amp; Initials</div></div>';
                html += '<div style="flex:1; min-width:140px; text-align:center;"><div style="font-weight:600; font-size:0.95rem; color:#1f2937; margin-bottom:4px;">' + e(data.acknowledgedDate) + '</div>';
                html += '<div style="border-top:1px solid #374151; padding-top:4px; font-size:0.8rem; color:#374151;">Date</div></div>';
                html += '<div style="flex:1; min-width:140px; text-align:right;"><div style="height:24px;"></div>';
                html += '<div style="border-top:1px solid #374151; padding-top:4px; font-size:0.8rem; color:#374151;">Consultant Signature</div></div>';
                html += '</div>';
                html += '</div>';
            }

            html += '<p style="text-align:center; margin-top:16px; color:#9ca3af; font-size:0.75rem;">Dynapharm International Namibia &mdash; Health | Wealth | Freedom</p>';
            html += '</div>';
            return html;
        }

        function previewCheckupForm() {
            var data = _getCheckupFormData();
            var errEl = document.getElementById('checkupFormError');
            if (!data.fullName || !data.phone) {
                if (errEl) { errEl.textContent = 'Please fill in at least your Full Name and Phone before previewing.'; errEl.style.display = 'block'; }
                return;
            }
            if (!data.acknowledged) {
                if (errEl) { errEl.textContent = 'Please tick the declaration checkbox to confirm your information is correct.'; errEl.style.display = 'block'; }
                var ackCb = document.getElementById('chkAcknowledge');
                if (ackCb) ackCb.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (errEl) errEl.style.display = 'none';
            var html = _buildCheckupPreviewHTML(data);
            document.getElementById('checkupPreviewContent').innerHTML = html;
            document.getElementById('checkupPreviewModal').style.display = 'block';
        }

        document.addEventListener('keydown', function(ev) {
            if (ev.key === 'Escape') {
                var modal = document.getElementById('checkupPreviewModal');
                if (modal && modal.style.display !== 'none') modal.style.display = 'none';
            }
        });

        function printCheckupForm() {
            var data = _getCheckupFormData();
            var errEl = document.getElementById('checkupFormError');
            if (!data.fullName || !data.phone) {
                if (errEl) { errEl.textContent = 'Please fill in at least your Full Name and Phone before printing.'; errEl.style.display = 'block'; }
                return;
            }
            if (!data.acknowledged) {
                if (errEl) { errEl.textContent = 'Please tick the declaration checkbox to confirm your information is correct.'; errEl.style.display = 'block'; }
                var ackCb = document.getElementById('chkAcknowledge');
                if (ackCb) ackCb.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (errEl) errEl.style.display = 'none';
            var html = _buildCheckupPreviewHTML(data);
            var printWin = window.open('', '_blank', 'width=800,height=900');
            if (!printWin) {
                alert('Pop-up blocked. Please allow pop-ups for this site to use the print feature.');
                return;
            }
            printWin.document.write('<!DOCTYPE html><html><head><title>Full Body Check Up - Dynapharm Namibia</title>');
            printWin.document.write('<style>body{font-family:Arial,Helvetica,sans-serif;margin:20px;color:#1f2937;} table{width:100%;border-collapse:collapse;} td{padding:8px 12px;border:1px solid #d1d5db;} @media print{body{margin:10px;}} .no-print{display:none;}</style>');
            printWin.document.write('</head><body>');
            printWin.document.write(html);
            printWin.document.write('</body></html>');
            printWin.document.close();
            setTimeout(function() { printWin.print(); }, 400);
        }

        function enterCheckupMode() {
            document.getElementById('landingTabShop').style.display = 'none';
            document.getElementById('landingTabCheckup').style.display = 'none';
            var navLinks = document.querySelectorAll('#desktopNavLinks > a, #desktopNavLinks > span#navLoginSection');
            navLinks.forEach(function(el) {
                if (el.textContent.trim() === 'Home') return;
                el.setAttribute('data-chk-hidden', '1');
                el.style.display = 'none';
            });
            var mobileLinks = document.querySelectorAll('#mobileMenu > a, #mobileMenu > #mobileLoginSection');
            mobileLinks.forEach(function(el) {
                if (el.textContent.trim() === 'Home') return;
                el.setAttribute('data-chk-hidden', '1');
                el.style.display = 'none';
            });
            var backBtn = document.getElementById('checkupBackBtn');
            if (backBtn) backBtn.style.display = 'inline-block';

            // Reset form to clean state each time it is opened
            var form = document.getElementById('checkupInlineForm');
            if (form) { form.style.display = ''; form.reset(); }
            var successMsg = document.getElementById('checkupSuccessMsg');
            if (successMsg) successMsg.style.display = 'none';
            var errEl = document.getElementById('checkupFormError');
            if (errEl) errEl.style.display = 'none';
            if (typeof _clearCheckupAutoFill === 'function') _clearCheckupAutoFill();
            if (typeof setCheckupClientType === 'function') setCheckupClientType('referred');
            if (typeof setCheckupVisitType === 'function') setCheckupVisitType('appointment');
        }

        function exitCheckupMode() {
            document.getElementById('landingTabShop').style.display = '';
            document.getElementById('landingTabCheckup').style.display = '';
            document.querySelectorAll('[data-chk-hidden]').forEach(function(el) {
                el.removeAttribute('data-chk-hidden');
                el.style.display = '';
            });
            var backBtn = document.getElementById('checkupBackBtn');
            if (backBtn) backBtn.style.display = 'none';
            showLandingTab('shop');
        }

        function setCheckupVisitType(type) {
            document.getElementById('checkupVisitType').value = type;
            var apptBtn = document.getElementById('checkupToggleAppt');
            var walkBtn = document.getElementById('checkupToggleWalkin');
            var dateWrap = document.getElementById('chkApptDateWrap');
            var timeWrap = document.getElementById('chkApptTimeWrap');
            if (type === 'appointment') {
                apptBtn.style.background = '#c41e3a'; apptBtn.style.color = 'white';
                walkBtn.style.background = 'white'; walkBtn.style.color = '#c41e3a';
                dateWrap.style.display = 'block'; timeWrap.style.display = 'block';
            } else {
                walkBtn.style.background = '#c41e3a'; walkBtn.style.color = 'white';
                apptBtn.style.background = 'white'; apptBtn.style.color = '#c41e3a';
                dateWrap.style.display = 'none'; timeWrap.style.display = 'none';
            }
        }

        (function initCheckupForm() {
            document.addEventListener('DOMContentLoaded', function() {
                initCheckupDistributorSearch();
                var form = document.getElementById('checkupInlineForm');
                if (!form) return;
                form.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    var errEl = document.getElementById('checkupFormError');
                    errEl.style.display = 'none';
                    var visitType = document.getElementById('checkupVisitType').value;
                    var fullName = document.getElementById('chkFullName').value.trim();
                    var phone = document.getElementById('chkPhone').value.trim();
                    var email = document.getElementById('chkEmail').value.trim();
                    var gender = document.getElementById('chkGender').value;
                    var dob = document.getElementById('chkDOB').value;
                    var branch = document.getElementById('chkBranch').value;
                    var apptDate = document.getElementById('chkApptDate').value;
                    var apptTime = document.getElementById('chkApptTime').value;
                    var concern = document.getElementById('chkConcern').value.trim();
                    var medications = document.getElementById('chkMedications').value.trim();
                    var notes = document.getElementById('chkNotes').value.trim();
                    var conditionEls = document.querySelectorAll('input[name="chkConditions"]:checked');
                    var conditions = Array.from(conditionEls).map(function(c) { return c.value; });
                    var clientType = document.getElementById('chkClientType').value;
                    var distributorName = document.getElementById('chkDistributorName').value.trim();
                    var distributorNB = document.getElementById('chkDistributorNB').value.trim();

                    if (!fullName || !phone || !gender || !dob || !branch || !concern) {
                        errEl.textContent = 'Please fill in all required fields.';
                        errEl.style.display = 'block';
                        return;
                    }
                    if (!distributorName || !distributorNB) {
                        errEl.textContent = clientType === 'member'
                            ? 'Please select your member name and NB number from the distributor list.'
                            : 'Please select the distributor who referred you from the search results.';
                        errEl.style.display = 'block';
                        return;
                    }
                    if (visitType === 'appointment' && (!apptDate || !apptTime)) {
                        errEl.textContent = 'Please select an appointment date and time.';
                        errEl.style.display = 'block';
                        return;
                    }
                    if (!_isCheckupAcknowledged()) {
                        errEl.textContent = 'Please tick the declaration checkbox to confirm your information is correct.';
                        errEl.style.display = 'block';
                        var ackCb = document.getElementById('chkAcknowledge');
                        if (ackCb) ackCb.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return;
                    }

                    var submitBtn = document.getElementById('checkupSubmitBtn');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Submitting...';

                    var healthData = {
                        gender: gender,
                        dob: dob,
                        concern: concern,
                        conditions: conditions.join(', ') || 'None',
                        medications: medications || 'N/A',
                        additionalNotes: notes,
                        clientType: clientType,
                        distributorName: distributorName,
                        distributorNB: distributorNB,
                        acknowledgedBy: fullName,
                        acknowledgedInitials: _getCheckupInitials(fullName),
                        acknowledgedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                    };
                    var refLabel = clientType === 'member' ? 'Member' : 'Referred by';
                    var payload = {
                        full_name: fullName,
                        phone: phone,
                        email: email || '',
                        branch: branch,
                        type: 'Full Body Check-Up',
                        client_reference: distributorNB,
                        notes: 'Visit: ' + visitType + ' | ' + refLabel + ': ' + distributorName + ' (' + distributorNB + ') | Concern: ' + concern + (conditions.length ? ' | Conditions: ' + conditions.join(', ') : '') + (medications ? ' | Medications: ' + medications : '') + (notes ? ' | Notes: ' + notes : ''),
                        data: JSON.stringify(healthData),
                        status: visitType === 'walkin' ? 'walk-in' : 'pending'
                    };
                    if (visitType === 'appointment') {
                        payload.date = apptDate;
                        payload.time = apptTime;
                    } else {
                        payload.date = new Date().toISOString().split('T')[0];
                        payload.time = new Date().toTimeString().slice(0,5);
                    }

                    try {
                        var res = await fetch('/api/appointments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        var data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Submission failed');
                        document.getElementById('checkupSuccessMsg').style.display = 'block';
                        var refText = 'Your reference number is: ' + (data.id || data.referenceNumber || 'N/A');
                        if (visitType === 'appointment') {
                            refText += '. Your appointment has been booked for ' + apptDate + ' at ' + apptTime + '.';
                        } else {
                            refText += '. Please proceed to the front desk at your selected branch.';
                        }
                        document.getElementById('checkupRefDisplay').textContent = refText;
                        form.style.display = 'none';
                    } catch (err) {
                        errEl.textContent = err.message || 'Something went wrong. Please try again.';
                        errEl.style.display = 'block';
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Submit';
                    }
                });
            });
        })();

        function showLandingPage() {
            // Never show landing page if a user is authenticated — they belong in their portal
            if (window.currentUser && window.currentUser.role) return;

            const landingPage = document.getElementById('landingPage');
            const container = document.querySelector('.container');
            const portalTabs = document.getElementById('portalTabs');
            const loginModal = document.getElementById('loginModal');
            
            // Check if login modal is open - don't show landing page if modal is visible
            let isLoginModalOpen = false;
            if (loginModal) {
                const modalDisplay = loginModal.style.display;
                const computedDisplay = getComputedStyle(loginModal).display;
                isLoginModalOpen = (modalDisplay !== 'none' && computedDisplay !== 'none') || 
                                 modalDisplay === 'flex' || computedDisplay === 'flex' ||
                                 modalDisplay === 'block' || computedDisplay === 'block';
            }
            
            // If login modal is open, don't hide/show anything - just return
            if (isLoginModalOpen) {
                return;
            }
            
            if (landingPage) landingPage.style.display = 'block';
            if (container) container.style.display = 'none';
            if (portalTabs) portalTabs.style.display = 'none';
            
            // Load shop products on landing page
            setTimeout(() => {
                if (typeof loadShopProducts === 'function') {
                    loadShopProducts();
                }
            }, 100);
        }
        
        function hideLandingPage() {
            const landingPage = document.getElementById('landingPage');
            const container = document.querySelector('.container');
            
            if (landingPage) landingPage.style.display = 'none';
            if (container) container.style.display = 'block';
            if (clientRegModalLandingActive) {
                const modal = document.getElementById('clientRegModal');
                if (modal) {
                    restoreClientRegModal(modal);
                }
            }
        }
        
        // Legacy function names for compatibility
        function showWelcomeOverlay() {
//             showLandingPage();
        }
        
        function hideWelcomeOverlay() {
            hideLandingPage();
        }
        
        function hideAllPortalTabs() {
            var portalTabsDiv = document.getElementById('portalTabs');
            if (portalTabsDiv) {
                portalTabsDiv.querySelectorAll(':scope > .tab-button').forEach(function(btn) {
                    btn.style.display = 'none';
                });
            }
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
        }
        
        function showAuthorizedPortals(role) {
            const authorizedPortals = ROLE_PORTAL_ACCESS[role] || ['client'];
            
            var portalTabs = document.getElementById('portalTabs');
            if (portalTabs) portalTabs.style.display = 'flex';
            
            var portalTabButtons = portalTabs ? portalTabs.querySelectorAll(':scope > .tab-button') : [];
            portalTabButtons.forEach(function(btn) {
                var onclickAttr = btn.getAttribute('onclick') || '';
                var match = onclickAttr.match(/openTab\('([^']+)'/);
                if (match) {
                    if (role === 'admin' || authorizedPortals.includes(match[1])) {
                        btn.style.display = 'inline-block';
                    } else {
                        btn.style.display = 'none';
                    }
                }
            });
            
            var userDisplay = document.getElementById('currentUserDisplay');
            if (userDisplay && currentUser) {
                userDisplay.textContent = (currentUser.fullName || currentUser.username) + ' (' + role + ')';
            }
        }
        
        // Session Management
        let sessionTimeoutWarning = null;
        let sessionTimeoutTimer = null;
        let lastActivityTime = Date.now();
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        const SESSION_WARNING_TIME = 5 * 60 * 1000; // 5 minutes before timeout
        
        function resetSessionTimer() {
            lastActivityTime = Date.now();
            clearTimeout(sessionTimeoutWarning);
            clearTimeout(sessionTimeoutTimer);
            
            // Set warning timer (5 minutes before timeout)
            sessionTimeoutWarning = setTimeout(() => {
                showSessionTimeoutWarning();
            }, SESSION_TIMEOUT - SESSION_WARNING_TIME);
            
            // Set actual timeout
            sessionTimeoutTimer = setTimeout(() => {
                performAutoLogout();
            }, SESSION_TIMEOUT);
        }
        
        function showSessionTimeoutWarning() {
            const modal = document.createElement('div');
            modal.id = 'sessionTimeoutModal';
            modal.className = 'modal-overlay';
            modal.style.cssText = 'display: flex; z-index: 10003;';
            modal.innerHTML = `
                <div class="modal-card" style="max-width: 450px;">
                    <h2 style="margin-bottom: 20px; color: #f59e0b;">⏰ Session Expiring Soon</h2>
                    <p style="color: #666; margin-bottom: 20px;">Your session will expire in 5 minutes due to inactivity.</p>
                    <div id="sessionCountdown" style="text-align: center; font-size: 1.5rem; font-weight: bold; color: #c41e3a; margin: 20px 0;">5:00</div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="extendSession()" class="btn" style="background: #c41e3a; color: white; padding: 12px; font-size: 1rem; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; flex: 1;">Extend Session</button>
                        <button onclick="performLogout()" class="btn" style="background: #f0f0f0; color: #666; padding: 12px; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer;">Logout Now</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Countdown timer
            let timeLeft = 300; // 5 minutes in seconds
            const countdownEl = document.getElementById('sessionCountdown');
            const countdownInterval = setInterval(() => {
                timeLeft--;
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                if (countdownEl) {
                    countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                }
            }, 1000);
        }
        
        function extendSession() {
            const modal = document.getElementById('sessionTimeoutModal');
            if (modal) modal.remove();
            resetSessionTimer();
            showToast('Session extended for 30 minutes', 'success');
        }
        
        function performAutoLogout() {
            const modal = document.getElementById('sessionTimeoutModal');
            if (modal) modal.remove();
            showToast('Session expired due to inactivity', 'warning');
            performLogout(true);
        }
        
        function performLogout(isAutoLogout = false) {
            
            const modal = document.getElementById('sessionTimeoutModal');
            if (modal) modal.remove();
            
            // Clear session timers
            clearTimeout(sessionTimeoutWarning);
            clearTimeout(sessionTimeoutTimer);
            
            // Clear user data from memory and localStorage
            currentUser = null;
            window.currentUser = null;
            currentPortal = null;
            window.currentPortal = null;
            
            try {
                localStorage.removeItem('dyna_portal_user');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('currentUserRole');
                localStorage.removeItem('rememberedSession');
                localStorage.removeItem('warehouseFilter');
                localStorage.removeItem('dynapharm_active_portal');
                localStorage.removeItem('dynapharm_frontdesk_tab');
            } catch (e) {
                console.warn('Failed to clear localStorage:', e);
            }
            
            // Call logout API if available
            if (typeof logoutRequest === 'function') {
                logoutRequest().catch(err => console.error('Logout API error:', err));
            }
            
            // Stop auto-refresh
            if (typeof stopAutoRefresh === 'function') {
                stopAutoRefresh();
            }
            
            // Hide realtime status
            if (typeof hideRealtimeStatus === 'function') {
                hideRealtimeStatus();
            }
            
            // Hide portal tabs
            hideAllPortalTabs();
            const portalTabs = document.getElementById('portalTabs');
            if (portalTabs) portalTabs.style.display = 'none';
            
            // Reset navigation
            const navLoginSection = document.getElementById('navLoginSection');
            const navUserSection = document.getElementById('navUserSection');
            if (navLoginSection) navLoginSection.style.display = 'block';
            if (navUserSection) navUserSection.style.display = 'none';
            document.querySelectorAll('#desktopNavLinks > a, #mobileMenu > a').forEach(function(link) {
                link.style.display = '';
            });
            
            // Hide main container
            const container = document.querySelector('.container');
            if (container) container.style.display = 'none';
            
            // Show landing page
            showLandingPage();
            
            // Reset only the known portal-level Auth/Content wrappers on logout
            var _LOGOUT_PORTAL_PAIRS = ['consultant', 'dispenser', 'stock', 'gm', 'director', 'admin', 'mis'];
            _LOGOUT_PORTAL_PAIRS.forEach(function(p) {
                var a = document.getElementById(p + 'Auth');
                var c = document.getElementById(p + 'Content');
                if (a) a.style.display = '';  // restore to CSS default (block/visible)
                if (c) c.style.display = 'none';
            });
            
            
            if (!isAutoLogout) {
                showToast('Logged out successfully', 'success');
            }
        }
        
        function logout() {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = 'display: flex; z-index: 10001;';
            modal.innerHTML = `
                <div class="modal-card" style="max-width: 450px;">
                    <h2 style="margin-bottom: 20px; color: #c41e3a;">🚪 Confirm Logout</h2>
                    <p style="color: #666; margin-bottom: 20px;">Are you sure you want to logout?</p>
                    ${currentUser ? `<p style="color: #999; font-size: 0.9rem; margin-bottom: 20px;">Logged in as: <strong>${currentUser.fullName || currentUser.username}</strong></p>` : ''}
                    <div style="display: flex; gap: 10px;">
                        <button onclick="performLogout(); this.closest('.modal-overlay').remove();" class="btn" style="background: #c41e3a; color: white; padding: 12px; font-size: 1rem; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; flex: 1;">Logout</button>
                        <button onclick="this.closest('.modal-overlay').remove();" class="btn" style="background: #f0f0f0; color: #666; padding: 12px; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer;">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        // Track user activity to reset session timer
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => {
                // Check if currentUser exists (safely check window.currentUser first)
                try {
                    const user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
//                     if (user) {
//                         resetSessionTimer();
//                     }
                } catch (e) {
                    // Silently ignore if currentUser is not defined yet
                }
            }, { passive: true });
        });
//         
//         // Initialize session timer when user logs in
//         const originalHandlePortalLoginSuccess = window.handlePortalLoginSuccess;
//         if (originalHandlePortalLoginSuccess) {
//             window.handlePortalLoginSuccess = function(user, options) {
//                 originalHandlePortalLoginSuccess(user, options);
//                 resetSessionTimer();
//             };
//         }
//         
//         // Portal Quick Access, Favorites, and Search
//         const PORTAL_INFO = {
//             'client': { name: 'Distributor / Guest', icon: '🛒', category: 'Client' },
//             'frontdesk': { name: 'Front Desk Portal', icon: '🏢', category: 'Operations' },
//             'consultant': { name: 'Consultant Portal', icon: '👨‍⚕️', category: 'Operations' },
//             'dispenser': { name: 'Branch Portal', icon: '💊', category: 'Operations' },
//             'hr-portal': { name: 'HR Portal', icon: '👔', category: 'Management' },
//             'finance': { name: 'Finance Portal', icon: '💰', category: 'Management' },
//             'gm': { name: 'GM Portal', icon: '👑', category: 'Executive' },
//             'director': { name: 'Director Portal', icon: '🎯', category: 'Executive' },
//             'mis': { name: 'MIS Portal', icon: '📊', category: 'Management' },
//             'stock': { name: 'Stock Management', icon: '📦', category: 'Operations' },
//             'admin': { name: 'Admin Portal', icon: '⚙️', category: 'Administration' }
//         };
        
        function getFavoritePortals() {
            return JSON.parse(localStorage.getItem('favoritePortals') || '[]');
        }
        
        function setFavoritePortals(favorites) {
            localStorage.setItem('favoritePortals', JSON.stringify(favorites));
        }
        
        function toggleFavorite(portalId) {
            const favorites = getFavoritePortals();
            const index = favorites.indexOf(portalId);
            if (index > -1) {
                favorites.splice(index, 1);
            } else {
                favorites.push(portalId);
            }
            setFavoritePortals(favorites);
            renderPortalQuickAccess();
        }
        
        function getRecentPortals() {
            return JSON.parse(localStorage.getItem('recentPortals') || '[]');
        }
        
        function addRecentPortal(portalId) {
            const recent = getRecentPortals();
            const index = recent.indexOf(portalId);
            if (index > -1) {
                recent.splice(index, 1);
            }
            recent.unshift(portalId);
            if (recent.length > 5) {
                recent.pop();
            }
            localStorage.setItem('recentPortals', JSON.stringify(recent));
        }
        
        function renderPortalQuickAccess() {
            const quickAccess = document.getElementById('portalQuickAccess');
            if (!quickAccess) return;
            
            const favorites = getFavoritePortals();
            const recent = getRecentPortals();
            const role = getCurrentUserRole()?.toLowerCase() || 'guest';
            const allowedPortals = ROLE_PORTAL_ACCESS[role] || ['client'];
            
            // Render favorites
            const favoritesList = document.getElementById('favoritePortalsList');
            if (favoritesList) {
                if (favorites.length === 0) {
                    favoritesList.innerHTML = '<div style="color: #999; font-size: 0.85rem; padding: 8px;">No favorites yet. Click ⭐ to add.</div>';
                } else {
                    favoritesList.innerHTML = favorites
                        .filter(id => allowedPortals.includes(id))
                        .map(id => {
                            const info = PORTAL_INFO[id] || { name: id, icon: '📋' };
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 6px; cursor: pointer; background: #f8f9fa;" 
                                     onmouseover="this.style.background='#e9ecef'" 
                                     onmouseout="this.style.background='#f8f9fa'"
                                     onclick="openTab('${id}', event); togglePortalQuickAccess();">
                                    <span>${info.icon} ${info.name}</span>
                                    <button onclick="event.stopPropagation(); toggleFavorite('${id}');" style="background: none; border: none; cursor: pointer; font-size: 1rem;">⭐</button>
                                </div>
                            `;
                        }).join('');
                }
            }
            
            // Render recent
            const recentList = document.getElementById('recentPortalsList');
            if (recentList) {
                if (recent.length === 0) {
                    recentList.innerHTML = '<div style="color: #999; font-size: 0.85rem; padding: 8px;">No recent portals.</div>';
                } else {
                    recentList.innerHTML = recent
                        .filter(id => allowedPortals.includes(id) && !favorites.includes(id))
                        .slice(0, 3)
                        .map(id => {
                            const info = PORTAL_INFO[id] || { name: id, icon: '📋' };
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 6px; cursor: pointer; background: #f8f9fa;" 
                                     onmouseover="this.style.background='#e9ecef'" 
                                     onmouseout="this.style.background='#f8f9fa'"
                                     onclick="openTab('${id}', event); togglePortalQuickAccess();">
                                    <span>${info.icon} ${info.name}</span>
                                    <button onclick="event.stopPropagation(); toggleFavorite('${id}');" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; color: #999;">☆</button>
                                </div>
                            `;
                        }).join('');
                }
            }
            
            // Render all portals
            const allPortalsList = document.getElementById('allPortalsList');
            if (allPortalsList) {
                const filtered = allowedPortals.filter(id => !favorites.includes(id) && !recent.slice(0, 3).includes(id));
                if (filtered.length === 0) {
                    allPortalsList.innerHTML = '<div style="color: #999; font-size: 0.85rem; padding: 8px;">All portals shown above.</div>';
                } else {
                    allPortalsList.innerHTML = filtered.map(id => {
                        const info = PORTAL_INFO[id] || { name: id, icon: '📋', category: 'Other' };
                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 6px; cursor: pointer; background: #f8f9fa;" 
                                 onmouseover="this.style.background='#e9ecef'" 
                                 onmouseout="this.style.background='#f8f9fa'"
                                 onclick="openTab('${id}', event); togglePortalQuickAccess();">
                                <span>${info.icon} ${info.name}</span>
                                <button onclick="event.stopPropagation(); toggleFavorite('${id}');" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; color: #999;">☆</button>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
        
        function togglePortalQuickAccess() {
            const quickAccess = document.getElementById('portalQuickAccess');
            if (!quickAccess) return;
            
            if (quickAccess.style.display === 'none' || !quickAccess.style.display) {
                quickAccess.style.display = 'block';
                renderPortalQuickAccess();
            } else {
                quickAccess.style.display = 'none';
            }
        }
        
        function filterPortals() {
            const searchTerm = document.getElementById('portalSearchInput')?.value.toLowerCase() || '';
            const role = getCurrentUserRole()?.toLowerCase() || 'guest';
            const allowedPortals = ROLE_PORTAL_ACCESS[role] || ['client'];
            
            const allPortalsList = document.getElementById('allPortalsList');
            if (!allPortalsList) return;
            
            const favorites = getFavoritePortals();
            const recent = getRecentPortals();
            const filtered = allowedPortals.filter(id => {
                const info = PORTAL_INFO[id] || { name: id };
                return info.name.toLowerCase().includes(searchTerm) && 
                       !favorites.includes(id) && 
                       !recent.slice(0, 3).includes(id);
            });
            
            if (filtered.length === 0) {
                allPortalsList.innerHTML = '<div style="color: #999; font-size: 0.85rem; padding: 8px;">No portals found.</div>';
            } else {
                allPortalsList.innerHTML = filtered.map(id => {
                    const info = PORTAL_INFO[id] || { name: id, icon: '📋' };
                    return `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 6px; cursor: pointer; background: #f8f9fa;" 
                             onmouseover="this.style.background='#e9ecef'" 
                             onmouseout="this.style.background='#f8f9fa'"
                             onclick="openTab('${id}', event); togglePortalQuickAccess();">
                            <span>${info.icon} ${info.name}</span>
                            <button onclick="event.stopPropagation(); toggleFavorite('${id}');" style="background: none; border: none; cursor: pointer; font-size: 0.9rem; color: #999;">☆</button>
                        </div>
                    `;
                }).join('');
            }
        }
        
        // Override openTab to track recent portals
        const originalOpenTab = window.openTab;
        if (originalOpenTab) {
            window.openTab = function(tabName, event) {
                if (tabName && tabName !== 'client') {
                    addRecentPortal(tabName);
                }
                return originalOpenTab(tabName, event);
            };
        }
        
        // Close quick access when clicking outside
        document.addEventListener('click', function(e) {
            const quickAccess = document.getElementById('portalQuickAccess');
            const quickAccessBtn = document.querySelector('[onclick="togglePortalQuickAccess()"]');
            if (quickAccess && quickAccess.style.display !== 'none' && 
                !quickAccess.contains(e.target) && 
                !quickAccessBtn?.contains(e.target)) {
                quickAccess.style.display = 'none';
            }
        });
        
        function continueAsGuest() {
            // Guest access - show landing page with shop (already visible)
//             setCurrentUserRole('guest');
            currentUser = { role: 'guest', username: 'guest', fullName: 'Guest User' };
            window.currentUser = currentUser;
            // Database API only - no localStorage for user data
            // localStorage.setItem('currentUser', JSON.stringify(currentUser));
            // localStorage.setItem('currentUserRole', 'guest');
            // Landing page is already visible, show shop tab and ensure products are loaded
            showLandingPage();
            showLandingTab('shop');
            setTimeout(() => {
                if (typeof loadShopProducts === 'function') {
                    loadShopProducts();
                }
            }, 100);
        }
        
        function showStaffLogin() {
            currentPortal = '__staff_login__';
            window.currentPortal = '__staff_login__';
            
            var loginModal = document.getElementById('loginModal');
            if (!loginModal) {
                setTimeout(showStaffLogin, 400);
                return;
            }
            // Move to document.body so it is NOT inside the hidden .container div
            if (loginModal.parentNode !== document.body) {
                document.body.appendChild(loginModal);
            }
            loginModal.style.cssText = 'display:flex !important; position:fixed; z-index:99999; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); align-items:center; justify-content:center;';
            loginModal.setAttribute('aria-hidden', 'false');
            if (typeof switchStaffAuthTab === 'function') switchStaffAuthTab('login');
            setTimeout(function() {
                var usernameInput = document.getElementById('username');
                if (usernameInput) usernameInput.focus();
            }, 150);
        }
        
        function hideStaffLogin() {
            hideStaffLoginModal();
        }
        
        // Handle Staff Login Form Submission
        async function submitStaffLogin(event) {
            if (event) event.preventDefault();
            
            const username = document.getElementById('unifiedUsername')?.value?.trim();
            const password = document.getElementById('unifiedPassword')?.value;
            const rememberMe = document.getElementById('rememberMe')?.checked || false;
            const loginBtn = document.getElementById('staffLoginBtn');
            const errorDiv = document.getElementById('staffLoginError');
            
            
            // Check if all functions have finished loading
            if (!window.functionsLoaded) {
                if (errorDiv) {
                    errorDiv.textContent = 'Page is still loading... Please wait a moment and try again.';
                    errorDiv.style.display = 'block';
                }
                // Retry after a delay
                setTimeout(() => {
                    if (typeof submitStaffLogin === 'function') {
                        submitStaffLogin(event);
                    }
                }, 1000);
                return;
            }
            
            // Clear previous errors
            if (errorDiv) errorDiv.style.display = 'none';
            
            // Validation
            if (!username || !password) {
                showLoginError('Please enter both username and password');
                return;
            }
            
            // Show loading state
            if (loginBtn) {
                const btnText = loginBtn.querySelector('.btn-text');
                const btnLoading = loginBtn.querySelector('.btn-loading');
                if (btnText) btnText.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'inline';
                loginBtn.disabled = true;
            }
            
            try {
                const result = await window.loginPortalRequest(username, password);
                
                if (result && result.user) {
                    const user = result.user;
                    user.username = user.username || username;
                    
                    // Handle remember me
                    if (rememberMe) {
                        localStorage.setItem('rememberMe', 'true');
                        localStorage.setItem('rememberedUsername', username);
                    } else {
                        localStorage.removeItem('rememberMe');
                        localStorage.removeItem('rememberedUsername');
                    }
                    
                    
                    // Store user in localStorage for persistence
                    try {
                        localStorage.setItem('dyna_portal_user', JSON.stringify({
                            username: user.username,
                            role: user.role,
                            fullName: user.fullName || user.full_name,
                            email: user.email,
                            phone: user.phone,
                            branch: user.branch,
                            branches: user.branches || [],
                            timestamp: Date.now()
                        }));
                        window.currentUser = user;
                    } catch (e) {
                        console.warn('Failed to store user:', e);
                    }
                    
                    hideStaffLoginModal();
                    
                    // Call the login success handler - retry until available
                    let retries = 0;
                    const maxRetries = 20; // Try for up to 4 seconds
                    const tryLoginSuccess = () => {
                        retries++;
                        
                        if (typeof window.handlePortalLoginSuccess === 'function') {
                            window.handlePortalLoginSuccess(user, { silent: true });
                        } else if (typeof handlePortalLoginSuccess === 'function') {
                            handlePortalLoginSuccess(user, { silent: true });
                        } else if (retries < maxRetries) {
                            setTimeout(tryLoginSuccess, 200);
                        } else {
                            console.error('❌ handlePortalLoginSuccess not found after', retries, 'attempts! Opening portal manually...');
                            
                            // Manual fallback
                            try {
                                // Set the user globally
                                window.currentUser = user;
                                
                                // Hide landing page
                                const landingPage = document.getElementById('landingPage');
                                if (landingPage) landingPage.style.display = 'none';
                                
                                // Show container
                                const container = document.querySelector('.container');
                                if (container) container.style.display = 'block';
                                
                                // Show portal tabs
                                const portalTabs = document.getElementById('portalTabs');
                                if (portalTabs) portalTabs.style.display = 'flex';
                                
                                // Determine portal based on role
                                const targetPortal = getDefaultPortalForRole(user.role) || 'dispenser';
                                
                                
                                // Open the portal
                                if (typeof openTab === 'function') {
                                    openTab(targetPortal, null);
                                } else if (typeof window.openTab === 'function') {
                                    window.openTab(targetPortal, null);
                                } else {
                                    console.error('openTab function not found! Trying direct DOM manipulation...');
                                    
                                    // Last resort: directly show the portal tab
                                    const portalElement = document.getElementById(targetPortal);
                                    if (portalElement) {
                                        // Hide all tabs
                                        document.querySelectorAll('.tab-content').forEach(t => {
                                            t.classList.remove('active');
                                            t.style.display = 'none';
                                        });
                                        // Show target portal
                                        portalElement.classList.add('active');
                                        portalElement.style.display = 'block';
                                    } else {
                                        console.error('Portal element not found:', targetPortal);
                                    }
                                }
                            } catch (fallbackError) {
                                console.error('Fallback failed:', fallbackError);
                                alert('Login successful but portal failed to open. Please refresh the page.');
                            }
                        }
                    };
                    
                    setTimeout(tryLoginSuccess, 200);
                } else {
                    throw new Error('Invalid response from server');
                }
            } catch (error) {
                console.error('❌ Staff login error:', error);
                showLoginError(error.message || 'Login failed. Please try again.', true);
            } finally {
                // Reset button state
                if (loginBtn) {
                    const btnText = loginBtn.querySelector('.btn-text');
                    const btnLoading = loginBtn.querySelector('.btn-loading');
                    if (btnText) btnText.style.display = 'inline';
                    if (btnLoading) btnLoading.style.display = 'none';
                    loginBtn.disabled = false;
                }
            }
        }
        
        function hideStaffLoginModal() {
            var modal = document.getElementById('staffLoginModal');
            if (modal) modal.style.display = 'none';
            var loginMod = document.getElementById('loginModal');
            if (loginMod) { loginMod.style.display = 'none'; loginMod.setAttribute('aria-hidden', 'true'); }
            var usernameField = document.getElementById('unifiedUsername');
            var passwordField = document.getElementById('unifiedPassword');
            if (usernameField) usernameField.value = '';
            if (passwordField) passwordField.value = '';
        }
        
        // Password Visibility Toggle
        function togglePasswordVisibility(inputId, button) {
            const input = document.getElementById(inputId);
            if (!input) return;
            
            if (input.type === 'password') {
                input.type = 'text';
                button.textContent = '🙈';
                button.setAttribute('aria-label', 'Hide password');
            } else {
                input.type = 'password';
                button.textContent = '👁️';
                button.setAttribute('aria-label', 'Show password');
            }
        }
        
        // Forgot Password Functions
        function showForgotPassword() {
            hideStaffLoginModal();
            const modal = document.getElementById('forgotPasswordModal');
            if (modal) modal.style.display = 'flex';
        }
        
        function hideForgotPasswordModal() {
            const modal = document.getElementById('forgotPasswordModal');
            if (modal) modal.style.display = 'none';
            document.getElementById('forgotPasswordUsername').value = '';
            document.getElementById('forgotPasswordError').style.display = 'none';
            document.getElementById('forgotPasswordSuccess').style.display = 'none';
        }
        
        async function submitForgotPassword() {
            const username = document.getElementById('forgotPasswordUsername').value.trim();
            const errorDiv = document.getElementById('forgotPasswordError');
            const successDiv = document.getElementById('forgotPasswordSuccess');
            
            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            
            if (!username) {
                errorDiv.textContent = 'Please enter your username or email';
                errorDiv.style.display = 'block';
                return;
            }
            
            try {
                // TODO: Implement API endpoint for password reset
                // For now, show a message
                successDiv.innerHTML = 'Password reset instructions have been sent to your email (if account exists).<br>Please check your inbox or contact your administrator.';
                successDiv.style.display = 'block';
                
                setTimeout(() => {
                    hideForgotPasswordModal();
                    showLogin('dispenser');
                }, 3000);
            } catch (error) {
                errorDiv.textContent = error.message || 'Failed to send reset instructions. Please contact your administrator.';
                errorDiv.style.display = 'block';
            }
        }
        
        // Track login attempts
        let loginAttempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
        const MAX_LOGIN_ATTEMPTS = 5;
        const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
        
        function checkLoginLockout(username) {
            const attempts = loginAttempts[username] || { count: 0, lastAttempt: 0 };
            const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
            
            if (attempts.count >= MAX_LOGIN_ATTEMPTS && timeSinceLastAttempt < LOCKOUT_DURATION) {
                const remainingMinutes = Math.ceil((LOCKOUT_DURATION - timeSinceLastAttempt) / 60000);
                throw new Error(`Account locked due to too many failed attempts. Please try again in ${remainingMinutes} minute(s) or contact your administrator.`);
            }
            
            if (timeSinceLastAttempt >= LOCKOUT_DURATION) {
                attempts.count = 0;
            }
            
            return attempts;
        }
        
        function recordLoginAttempt(username, success) {
            if (!loginAttempts[username]) {
                loginAttempts[username] = { count: 0, lastAttempt: 0 };
            }
            
            if (success) {
                loginAttempts[username].count = 0;
            } else {
                loginAttempts[username].count++;
            }
            
            loginAttempts[username].lastAttempt = Date.now();
            localStorage.setItem('loginAttempts', JSON.stringify(loginAttempts));
        }
        
        function showLoginError(message, showAttempts = false) {
            const errorDiv = document.getElementById('staffLoginError');
            if (!errorDiv) return;
            
            let errorMessage = message;
            const username = document.getElementById('unifiedUsername').value.trim();
            if (showAttempts && username) {
                const attempts = loginAttempts[username] || { count: 0 };
                const remaining = MAX_LOGIN_ATTEMPTS - attempts.count;
                if (remaining > 0) {
                    errorMessage += ` (${remaining} attempt${remaining > 1 ? 's' : ''} remaining)`;
                }
            }
            
            errorDiv.textContent = errorMessage;
            errorDiv.style.display = 'block';
            
            // Scroll to error
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Action-level guards
        const ACTION_ROLES = {
            dispense: ['dispenser','pharmacist','branch','branch_manager','admin','supervisor'],
            collect_payment: ['cashier','finance','admin','supervisor'],
            reverse_payment: ['admin','supervisor','finance_manager','finance']
        };
        function getEffectiveRole(){
            try {
                if (window.currentUser && window.currentUser.role) return String(window.currentUser.role).toLowerCase();
            } catch(_){ }
            try {
                if (currentUser && currentUser.role) return String(currentUser.role).toLowerCase();
            } catch(_){ }
            try { return String(getCurrentUserRole()).toLowerCase(); } catch(_){ return 'guest'; }
        }
        function hasActionPermission(action){
            const role = getEffectiveRole();
            // Branch portal users (branch, branch_manager) have full access in their portal
            if ((role === 'branch' || role === 'branch_manager') && 
                (window.currentPortal === 'branch' || window.currentPortal === 'dispenser')) {
                return true;
            }
            const allowed = ACTION_ROLES[action] || [];
            return allowed.includes(role) || role === 'admin';
        }

        // Schedule report helpers
        function openScheduleModal(portal){
            document.getElementById('schedulePortal').value = portal;
            document.getElementById('scheduleModal').style.display = 'flex';
        }
        function closeScheduleModal(){ document.getElementById('scheduleModal').style.display = 'none'; }
        function saveReportSchedule(){
            const portal = document.getElementById('schedulePortal').value;
            const frequency = document.getElementById('scheduleFrequency').value;
            const recipients = (document.getElementById('scheduleRecipients').value||'').trim();
            const schedules = JSON.parse(localStorage.getItem('report_schedules')||'{}');
            schedules[portal] = { frequency, recipients, savedAt: new Date().toISOString() };
            localStorage.setItem('report_schedules', JSON.stringify(schedules));
            alert('Report schedule saved.');
            closeScheduleModal();
        }
        function composeReportEmail(portal){
            const recipients = (JSON.parse(localStorage.getItem('report_schedules')||'{}')[portal]?.recipients)||'';
            const subject = encodeURIComponent(`[Dynapharm] ${portal.toUpperCase()} Report`);
            const summary = gatherPortalSummary(portal);
            const body = encodeURIComponent(summary + '\n\nExport PDF from the portal if needed.');
            const href = `mailto:${encodeURIComponent(recipients)}?subject=${subject}&body=${body}`;
            window.location.href = href;
        }
        
        function openAnalyticsReportingPortal() {
            const modal = document.getElementById('analyticsReportingModal');
            if (modal) {
                modal.style.display = 'flex';
                initializeAnalyticsReporting();
                return;
            }
            
            const analyticsModal = document.createElement('div');
            analyticsModal.id = 'analyticsReportingModal';
            analyticsModal.className = 'modal';
            analyticsModal.style.display = 'flex';
            analyticsModal.innerHTML = `
                <div class="modal-content" style="max-width: 95%; max-height: 95vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #c41e3a; padding-bottom: 15px;">
                        <h2 style="color: #c41e3a; margin: 0;">📈 Analytics & Reporting Portal</h2>
                        <button onclick="closeAnalyticsReportingPortal()" style="background: #c41e3a; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px;">✕ Close</button>
                    </div>
                    
                    <div class="tabs" style="margin-bottom: 20px;">
                        <button class="tab-button active" onclick="switchAnalyticsTab('builder')">📊 Custom Report Builder</button>
                        <button class="tab-button" onclick="switchAnalyticsTab('sales')">💰 Sales Analytics</button>
                        <button class="tab-button" onclick="switchAnalyticsTab('patients')">👥 Patient Analytics</button>
                        <button class="tab-button" onclick="switchAnalyticsTab('products')">📦 Product Performance</button>
                        <button class="tab-button" onclick="switchAnalyticsTab('branches')">🏢 Branch Comparison</button>
                        <button class="tab-button" onclick="switchAnalyticsTab('trends')">📈 Trend Analysis</button>
                    </div>
                    
                    <div id="analyticsBuilder" class="analytics-tab-content active">
                        <h3>📊 Custom Report Builder</h3>
                        <div class="form-section">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Report Name</label>
                                    <input type="text" id="reportName" placeholder="e.g., Monthly Sales Report">
                                </div>
                                <div class="form-group">
                                    <label>Date Range</label>
                                    <select id="reportDateRange">
                                        <option value="today">Today</option>
                                        <option value="week">This Week</option>
                                        <option value="month" selected>This Month</option>
                                        <option value="quarter">This Quarter</option>
                                        <option value="year">This Year</option>
                                        <option value="custom">Custom Range</option>
                                    </select>
                                </div>
                                <div class="form-group" id="customDateRange" style="display: none; grid-column: span 2;">
                                    <label>Custom Date Range</label>
                                    <div style="display: flex; gap: 10px;">
                                        <input type="date" id="reportDateFrom" style="flex: 1;">
                                        <input type="date" id="reportDateTo" style="flex: 1;">
                                    </div>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Select Data Fields</label>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 10px;">
                                    <label><input type="checkbox" value="revenue" checked> Revenue</label>
                                    <label><input type="checkbox" value="transactions" checked> Transactions</label>
                                    <label><input type="checkbox" value="clients"> Clients</label>
                                    <label><input type="checkbox" value="products"> Products</label>
                                    <label><input type="checkbox" value="branches"> Branches</label>
                                    <label><input type="checkbox" value="bv"> BV Points</label>
                                    <label><input type="checkbox" value="margin"> Margin</label>
                                    <label><input type="checkbox" value="stock"> Stock Levels</label>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Filter by Branch</label>
                                <select id="reportBranchFilter" multiple style="min-height: 100px;">
                                    <option value="all">All Branches</option>
                                </select>
                            </div>
                            <div style="display: flex; gap: 10px; margin-top: 20px;">
                                <button class="btn btn-success" onclick="generateCustomReport()">📊 Generate Report</button>
                                <button class="btn btn-primary" onclick="exportReportToExcel()">📥 Export to Excel</button>
                                <button class="btn btn-info" onclick="exportReportToPDF()">📄 Export to PDF</button>
                            </div>
                            <div id="customReportOutput" style="margin-top: 20px;"></div>
                        </div>
                    </div>
                    
                    <div id="analyticsSales" class="analytics-tab-content">
                        <h3>💰 Sales Analytics</h3>
                        <div class="form-section">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Time Period</label>
                                    <select id="salesPeriod" onchange="refreshSalesAnalytics()">
                                        <option value="today">Today</option>
                                        <option value="week">This Week</option>
                                        <option value="month" selected>This Month</option>
                                        <option value="quarter">This Quarter</option>
                                        <option value="year">This Year</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Branch</label>
                                    <select id="salesBranchFilter" onchange="refreshSalesAnalytics()">
                                        <option value="all">All Branches</option>
                                    </select>
                                </div>
                            </div>
                            <div id="salesAnalyticsOutput" style="margin-top: 20px;"></div>
                        </div>
                    </div>
                    
                    <div id="analyticsPatients" class="analytics-tab-content">
                        <h3>👥 Patient Analytics</h3>
                        <div class="form-section">
                            <div id="patientAnalyticsOutput"></div>
                        </div>
                    </div>
                    
                    <div id="analyticsProducts" class="analytics-tab-content">
                        <h3>📦 Product Performance</h3>
                        <div class="form-section">
                            <div id="productAnalyticsOutput"></div>
                        </div>
                    </div>
                    
                    <div id="analyticsBranches" class="analytics-tab-content">
                        <h3>🏢 Branch Comparison</h3>
                        <div class="form-section">
                            <div id="branchComparisonOutput"></div>
                        </div>
                    </div>
                    
                    <div id="analyticsTrends" class="analytics-tab-content">
                        <h3>📈 Trend Analysis</h3>
                        <div class="form-section">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Metric</label>
                                    <select id="trendMetric">
                                        <option value="revenue">Revenue</option>
                                        <option value="transactions">Transactions</option>
                                        <option value="clients">New Clients</option>
                                        <option value="products">Product Sales</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Time Period</label>
                                    <select id="trendPeriod">
                                        <option value="7">Last 7 Days</option>
                                        <option value="30" selected>Last 30 Days</option>
                                        <option value="90">Last 90 Days</option>
                                        <option value="365">Last Year</option>
                                    </select>
                                </div>
                            </div>
                            <button class="btn btn-success" onclick="refreshTrendAnalysis()">📈 Analyze Trends</button>
                            <div id="trendAnalysisOutput" style="margin-top: 20px;"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(analyticsModal);
            initializeAnalyticsReporting();
        }
        
        function closeAnalyticsReportingPortal() {
            const modal = document.getElementById('analyticsReportingModal');
            if (modal) modal.style.display = 'none';
        }
        
        function switchAnalyticsTab(tabName) {
            document.querySelectorAll('.analytics-tab-content').forEach(tab => {
                tab.classList.remove('active');
                tab.style.display = 'none';
            });
            document.querySelectorAll('#analyticsReportingModal .tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const tabElement = document.getElementById('analytics' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
            if (tabElement) {
                tabElement.classList.add('active');
                tabElement.style.display = 'block';
            }
            
            event.target.classList.add('active');
            
            if (tabName === 'sales') refreshSalesAnalytics();
            else if (tabName === 'patients') refreshPatientAnalytics();
            else if (tabName === 'products') refreshProductAnalytics();
            else if (tabName === 'branches') refreshBranchComparison();
            else if (tabName === 'trends') refreshTrendAnalysis();
        }
        
        function initializeAnalyticsReporting() {
            const dateRange = document.getElementById('reportDateRange');
            if (dateRange) {
                dateRange.addEventListener('change', function() {
                    document.getElementById('customDateRange').style.display = 
                        this.value === 'custom' ? 'block' : 'none';
                });
            }
            
            populateBranchFilters();
            refreshSalesAnalytics();
        }
        
        // =============================================================================
        // MISSING TAB SWITCHING FUNCTIONS - Added 2025-01-15
        // =============================================================================
        
        /**
         * Show Distributor/Client sub-tabs (Shop, Checkup, Media, Testimonials)
         */
        function showDistributorTab(tabName) {
            
            var clientDiv = document.getElementById('client');
            if (!clientDiv) return;
            
            clientDiv.querySelectorAll('.distributor-subtab').forEach(function(tab) {
                tab.style.display = 'none';
                tab.classList.remove('active');
            });
            
            var tabsContainer = clientDiv.querySelector('.tabs');
            if (tabsContainer) {
                tabsContainer.querySelectorAll('.tab-button').forEach(function(btn) {
                    btn.classList.remove('active');
                });
            }
            
            var selectedTab = document.getElementById('distributor-' + tabName + '-tab');
            if (selectedTab) {
                selectedTab.style.display = 'block';
                selectedTab.classList.add('active');
            } else {
            }
            
            if (event && event.target) {
                event.target.classList.add('active');
            } else if (tabsContainer) {
                var btn = tabsContainer.querySelector('[onclick*="showDistributorTab(\'' + tabName + '\')"]');
                if (btn) btn.classList.add('active');
            }
            
            if (tabName === 'shop') {
                if (typeof loadShopProducts === 'function') loadShopProducts();
            } else if (tabName === 'checkup') {
                if (typeof loadCheckupAppointments === 'function') loadCheckupAppointments();
            }
        }
        
        /**
         * Show Front Desk order management tabs
         */
        var frontDeskTabMap = {
            'pending': 'pendingOrders',
            'processing': 'processingOrders',
            'shipped': 'shippedOrders',
            'delivered': 'deliveredOrders',
            'all': 'allOrders',
            'appointments': 'frontdeskAppointments',
            'clientRegistration': 'frontdeskClientRegistration',
            'payments': 'frontdeskPayments',
            'clientLookup': 'frontdeskClientLookup',
            'delivery': 'frontdeskDelivery',
            'visitors': 'frontdeskVisitors',
            'crm': 'frontdeskCRM',
            'notifications': 'frontdeskNotifications',
            'staffComm': 'frontdeskStaffCommunication',
            'staffServices': 'frontdeskStaffServices'
        };

        function showOrderTab(tabName) {
            
            var frontdeskDiv = document.getElementById('frontdesk');
            if (!frontdeskDiv) { console.error('[NAV] frontdesk section not found'); return; }

            var allSections = frontdeskDiv.querySelectorAll('.order-tab-content');
            allSections.forEach(function(sec) {
                sec.style.display = 'none';
                sec.classList.remove('active');
            });
            
            var tabsContainer = frontdeskDiv.querySelector('.tabs');
            if (tabsContainer) {
                tabsContainer.querySelectorAll('.tab-button').forEach(function(btn) {
                    btn.classList.remove('active');
                });
            }
            
            var sectionId = frontDeskTabMap[tabName];
            if (!sectionId) {
                console.error('[NAV] Unknown front desk tab:', tabName);
                return;
            }
            var section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
                section.classList.add('active');
            } else {
                console.error('[NAV] Section not found:', sectionId);
                var placeholder = document.createElement('div');
                placeholder.className = 'order-tab-content';
                placeholder.style.display = 'block';
                placeholder.style.padding = '40px';
                placeholder.style.textAlign = 'center';
                placeholder.innerHTML = '<h3>Module available but content pending</h3><p style="color:#666;">The ' + tabName + ' module is being prepared.</p>';
                frontdeskDiv.appendChild(placeholder);
            }
            
            if (event && event.target) {
                event.target.classList.add('active');
            } else {
                var btn = tabsContainer ? tabsContainer.querySelector('[onclick*="showOrderTab(\'' + tabName + '\')"]') : null;
                if (btn) btn.classList.add('active');
            }
            
            try {
                localStorage.setItem('dynapharm_frontdesk_tab', tabName);
            } catch(e) {}
            
            switch(tabName) {
                case 'pending':
                case 'processing':
                case 'shipped':
                case 'delivered':
                case 'all':
                    if (typeof loadOrders === 'function') loadOrders(tabName);
                    break;
                case 'appointments':
                    if (typeof loadAppointments === 'function') loadAppointments();
                    if (typeof refreshFrontdeskAppointments === 'function') refreshFrontdeskAppointments();
                    break;
                case 'clientRegistration':
                    if (typeof initClientRegistration === 'function') initClientRegistration();
                    break;
                case 'clientLookup':
                    if (typeof initClientLookup === 'function') initClientLookup();
                    break;
                case 'payments':
                    if (typeof loadPaymentCollections === 'function') loadPaymentCollections();
                    break;
                case 'delivery':
                    if (typeof loadDeliverySchedule === 'function') loadDeliverySchedule();
                    break;
                case 'visitors':
                    if (typeof loadVisitors === 'function') loadVisitors();
                    break;
                case 'crm':
                    if (typeof loadCRMData === 'function') loadCRMData();
                    break;
                case 'notifications':
                    if (typeof loadNotifications === 'function') loadNotifications();
                    break;
                case 'staffComm':
                    if (typeof loadStaffCommunications === 'function') loadStaffCommunications();
                    break;
                case 'staffServices':
                    if (typeof loadStaffServices === 'function') loadStaffServices();
                    break;
            }
        }
        
        /**
         * Show Stock Management tabs
         */
        function showStockTab(tabName, evt = null) {
            const triggerEvent = evt || window.event || null;
            const stockContent = document.getElementById('stockContent');
            
            if (!stockContent) {
                return;
            }
            
            // Hide all stock tab contents - search in both stockContent and document
            const tabContents = [
                ...(stockContent.querySelectorAll('.stock-tab-content') || []),
                ...(document.querySelectorAll('.stock-tab-content') || [])
            ];
            // Remove duplicates
            const uniqueTabs = Array.from(new Set(tabContents));
            uniqueTabs.forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Remove active class from all tab buttons, workflow tabs, quick actions, sidebar links, and pill nav
            const allButtons = stockContent.querySelectorAll(
                '.stock-hub-tab-row .tab-button, ' +
                '.stock-hub-journey .workflow-tab, ' +
                '.stock-quick-btn, ' +
                '.stock-sidebar-links button, ' +
                '.hub-action, ' +
                '.stock-pill'
            );
            allButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.classList.remove('stock-quick-btn--active');
                btn.classList.remove('hub-action--active');
            });
            
            // Determine target tab element - try multiple strategies
            const candidateIds = [
                `${tabName}Tab`,           // Most common: countryImportTab
                `stock-tab-${tabName}`,    // Alternative: stock-tab-countryImport
                `${tabName}-tab`,          // Alternative: countryImport-tab
                `${tabName}_tab`           // Alternative: countryImport_tab
            ];
            
            let selectedTab = null;
            for (const id of candidateIds) {
                // First try within stockContent
                selectedTab = stockContent.querySelector(`#${id}`);
                if (selectedTab) break;
                // Then try globally
                selectedTab = document.getElementById(id);
                if (selectedTab) break;
            }
            
            if (selectedTab) {
                // Ensure parent containers are visible
                const tabsContainer = document.getElementById('stockTabsContainer');
                if (tabsContainer) {
                    tabsContainer.style.display = 'block';
                    tabsContainer.style.visibility = 'visible';
                }
                
                // Ensure stock-main section is visible
                const stockMain = stockContent.querySelector('.stock-main, .stock-main--full');
                if (stockMain) {
                    stockMain.style.display = 'flex';
                    stockMain.style.visibility = 'visible';
                }
                
                // Show the selected tab
                selectedTab.style.display = 'block';
                selectedTab.style.visibility = 'visible';
                selectedTab.style.opacity = '1';
                
                // Force a reflow to ensure display changes take effect
                selectedTab.offsetHeight;
                
            } else {
                // Try to find any tab with similar name
                const allTabs = document.querySelectorAll('.stock-tab-content');
            }
            
            // Highlight the triggering button (or fallback)
            let activeButton = triggerEvent?.currentTarget || triggerEvent?.target || null;
            const capitalize = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
            if (!activeButton && stockContent) {
                const cap = capitalize(tabName);
                const selectors = [
                    `#stockTab${cap}`,
                    `.workflow-tab[data-tab="${tabName}"]`,
                    `.tab-button[data-stock-tab="${tabName}"]`,
                    `.stock-sidebar-links button[data-stock-action="${tabName}"]`,
                    `.stock-quick-btn[data-stock-action="${tabName}"]`
                ];
                for (const selector of selectors) {
                    const candidate = stockContent.querySelector(selector);
                    if (candidate) {
                        activeButton = candidate;
                        break;
                    }
                }
            }
            if (activeButton) {
                activeButton.classList.add('active');
                // Also add appropriate class based on button type
                if (activeButton.classList.contains('stock-quick-btn')) {
                    activeButton.classList.add('stock-quick-btn--active');
                }
            }

            if (stockContent) {
                const cap = capitalize(tabName);
                const primaryTabButton = stockContent.querySelector(`#stockTab${cap}`);
                if (primaryTabButton && primaryTabButton !== activeButton) {
                    primaryTabButton.classList.add('active');
                }
                const workflowButton = stockContent.querySelector(`.stock-hub-journey .workflow-tab[data-tab="${tabName}"]`);
                if (workflowButton && workflowButton !== activeButton) {
                    workflowButton.classList.add('active');
                }
                const secondaryButton = stockContent.querySelector(`.stock-hub-tab-row--secondary .tab-button[data-stock-tab="${tabName}"]`);
                if (secondaryButton && secondaryButton !== activeButton) {
                    secondaryButton.classList.add('active');
                }
                // Also highlight sidebar links
                const sidebarLink = stockContent.querySelector(`.stock-sidebar-links button[data-stock-action="${tabName}"]`);
                if (sidebarLink && sidebarLink !== activeButton) {
                    sidebarLink.classList.add('active');
                }
                // Also highlight quick action buttons
                const quickBtn = stockContent.querySelector(`.stock-quick-btn[data-stock-action="${tabName}"]:not([data-import-mode])`);
                if (quickBtn && quickBtn !== activeButton) {
                    quickBtn.classList.add('stock-quick-btn--active');
                }
            }
            
            // Load data for specific tabs
            switch(tabName) {
                case 'overview':
                    if (typeof loadStockOverview === 'function') {
                        loadStockOverview();
                    }
                    if (typeof renderPurchaseOrders === 'function') renderPurchaseOrders();
                    if (typeof renderPlanInsights === 'function') renderPlanInsights();
                    if (typeof renderSupplierScorecard === 'function') renderSupplierScorecard();
                    break;
                case 'countryImport':
                    if (typeof loadCountryImports === 'function') {
                        loadCountryImports();
                    }
                    setTimeout(() => {
                        if (typeof spotlightCountryImport === 'function') {
                            spotlightCountryImport('manual');
                        }
                    }, 100);
                    break;
                case 'warehouseDistribution':
                    if (typeof loadWarehouseDistribution === 'function') {
                        loadWarehouseDistribution();
                    }
                    setTimeout(() => {
                        const form = document.querySelector('#warehouseDistributionTab form, #warehouseDistributionTab .hub-card');
                        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'branchDistribution':
                    if (typeof loadBranchDistribution === 'function') {
                        loadBranchDistribution();
                    }
                    setTimeout(() => {
                        const form = document.querySelector('#branchDistributionTab form, #branchDistributionTab .hub-card');
                        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'transfers':
                    if (typeof loadStockTransfers === 'function') {
                        loadStockTransfers();
                    }
                    setTimeout(() => {
                        const list = document.querySelector('#transfersTab .hub-scroll, #transfersTab table');
                        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'orders':
                    if (typeof renderPurchaseOrders === 'function') renderPurchaseOrders();
                    if (typeof renderPlanInsights === 'function') renderPlanInsights();
                    if (typeof renderSupplierScorecard === 'function') renderSupplierScorecard();
                    setTimeout(() => {
                        const form = document.querySelector('#ordersTab form, #ordersTab .hub-card');
                        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'invoices':
                    if (typeof renderInvoiceReports === 'function') {
                        renderInvoiceReports();
                    }
                    setTimeout(() => {
                        const table = document.querySelector('#invoicesTab table, #invoicesTab .hub-table-wrapper');
                        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'countryInventory':
                    if (typeof displayCountryStock === 'function') {
                        displayCountryStock();
                    }
                    setTimeout(() => {
                        const list = document.querySelector('#countryInventoryTab #countryStockList, #countryInventoryTab table');
                        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'realtime':
                    if (typeof loadRealtimeSyncStatus === 'function') {
                        loadRealtimeSyncStatus();
                    }
                    setTimeout(() => {
                        const status = document.querySelector('#realtimeTab .hub-card, #realtimeTab .hub-section');
                        if (status) status.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'barcode':
                    if (typeof loadBarcodeScans === 'function') {
                        loadBarcodeScans();
                    }
                    setTimeout(() => {
                        const scanner = document.querySelector('#barcodeTab form, #barcodeTab .hub-card');
                        if (scanner) scanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'sharing':
                    if (typeof loadShopWarehouseSharing === 'function') {
                        loadShopWarehouseSharing();
                    }
                    setTimeout(() => {
                        const form = document.querySelector('#sharingTab form, #sharingTab .hub-card');
                        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'distribution':
                    if (typeof displayDistributionHistory === 'function') {
                        displayDistributionHistory();
                    }
                    setTimeout(() => {
                        const list = document.querySelector('#distributionTab .hub-scroll, #distributionTab table');
                        if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    break;
                case 'windhoek':
                    if (typeof loadWindhoekProducts === 'function') {
                        loadWindhoekProducts();
                    }
                    break;
                case 'ondangwa':
                    if (typeof loadOndangwaProducts === 'function') {
                        loadOndangwaProducts();
                    }
                    break;
                case 'inventory':
                    if (typeof loadInventoryLog === 'function') {
                        loadInventoryLog();
                    }
                    break;
                case 'reorder':
                    if (typeof renderReorderScenarioResults === 'function') {
                        renderReorderScenarioResults();
                    }
                    break;
                case 'batch':
                    if (typeof renderReturnsList === 'function') {
                        renderReturnsList();
                    }
                    break;
            }
        }
        
        function toggleStockView(mode = 'main', skipAutoSwitch = false) {
            const normalized = (mode || 'main').toLowerCase();
            const tabsContainer = document.getElementById('stockTabsContainer');
            const workflowNav = document.getElementById('stockWorkflowNav');
            const staffSection = document.getElementById('stockStaffSection');
            const mainBtn = document.getElementById('stockMainTabBtn');
            const staffBtn = document.getElementById('stockStaffTabBtn');
            
            // Check if we're currently in staff view
            const wasStaffView = staffSection && staffSection.style.display !== 'none';
            const showMain = normalized !== 'staff';
            
            if (mainBtn) mainBtn.classList.toggle('hub-toggle-btn--active', normalized !== 'staff');
            if (staffBtn) staffBtn.classList.toggle('hub-toggle-btn--active', normalized === 'staff');
            
            if (tabsContainer) tabsContainer.style.display = showMain ? 'block' : 'none';
            if (workflowNav) workflowNav.style.display = showMain ? 'flex' : 'none';
            if (staffSection) staffSection.style.display = showMain ? 'none' : 'block';
            
            // Only auto-switch to overview if we're switching FROM staff TO main, and not skipping
            if (showMain && wasStaffView && !skipAutoSwitch) {
                showStockTab('overview');
            }
        }
        window.toggleStockView = toggleStockView;
        
        /**
         * Show Front Desk CRM tabs
         */
        function showFrontdeskCRMTab(tabName) {
            
            // Hide all CRM tab contents
            const tabContents = document.querySelectorAll('[id^="crm-tab-"]');
            tabContents.forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Remove active class from all CRM tab buttons
            const parentDiv = document.querySelector('.frontdesk-crm-tabs') || document.querySelector('.crm-container');
            if (parentDiv) {
                const tabButtons = parentDiv.querySelectorAll('.tab-button');
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                });
            }
            
            // Show selected tab content
            const selectedTab = document.getElementById(`crm-tab-${tabName}`);
            if (selectedTab) {
                selectedTab.style.display = 'block';
            } else {
            }
            
            // Set active button
            if (event && event.target) {
                event.target.classList.add('active');
            }
            
            // Load data for specific tabs
            switch(tabName) {
                case 'comm':
                    if (typeof loadCRMCommunications === 'function') {
                        loadCRMCommunications();
                    }
                    break;
                case 'segments':
                    if (typeof loadCRMSegments === 'function') {
                        loadCRMSegments();
                    }
                    break;
                case 'workflows':
                    if (typeof loadCRMWorkflows === 'function') {
                        loadCRMWorkflows();
                    }
                    break;
                case 'loyalty':
                    if (typeof loadLoyaltyProgram === 'function') {
                        loadLoyaltyProgram();
                    }
                    break;
            }
        }
        
        // Make functions globally accessible
        window.showDistributorTab = showDistributorTab;
        window.showOrderTab = showOrderTab;
        window.showStockTab = showStockTab;


        function _stockProductOptions(locationKey) {
            const batches = getBarcodeStockList();
            const map = new Map();
            batches.forEach(b => {
                const name = b.description || b.productName || '';
                const loc = String(b.location || '').toLowerCase();
                if (!name) return;
                if (locationKey && !loc.includes(locationKey)) return;
                const prev = map.get(name) || 0;
                const qty = Number(b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0);
                map.set(name, prev + (Number.isFinite(qty) ? qty : 0));
            });
            return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        }

        function _populateProductSelect(selectId, locationKey) {
            const sel = document.getElementById(selectId);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">Select Product</option>';
            _stockProductOptions(locationKey).forEach(([name, qty]) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name + ' (Avail: ' + qty + ')';
                sel.appendChild(opt);
            });
            if (cur) sel.value = cur;
        }

        function _populateBranchSelect(selectId) {
            const sel = document.getElementById(selectId);
            if (!sel) return;
            const cur = sel.value;
            sel.innerHTML = '<option value="">Select Branch</option>';
            (Array.isArray(branches) ? branches : []).forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id || b.name;
                opt.textContent = b.name || b.id;
                sel.appendChild(opt);
            });
            if (cur) sel.value = cur;
        }

        function _renderStockTable(items, containerId) {
            const el = document.getElementById(containerId);
            if (!el) return;
            if (!items.length) {
                el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No stock data available.</p>';
                return;
            }
            let html = '<table class="table"><thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Available</th><th>Expiry</th><th>Status</th></tr></thead><tbody>';
            items.forEach(b => {
                const expiry = b.expiryDate || b.expiry_date || '-';
                const status = b.status || 'available';
                const statusColor = status === 'available' ? '#27ae60' : status === 'low' ? '#f39c12' : '#e74c3c';
                html += '<tr>' +
                    '<td>' + (b.description || b.productName || '-') + '</td>' +
                    '<td>' + (b.batchNo || b.batch_no || '-') + '</td>' +
                    '<td>' + (b.quantity ?? 0) + '</td>' +
                    '<td style="font-weight:bold;color:#27ae60;">' + (b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0) + '</td>' +
                    '<td>' + expiry + '</td>' +
                    '<td><span style="background:' + statusColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:0.85rem;">' + status + '</span></td>' +
                    '</tr>';
            });
            html += '</tbody></table>';
            el.innerHTML = html;
        }

        function loadWindhoekProducts() {
            _populateProductSelect('windhoekProduct-legacy', 'country');
        }

        function updateWindhoekAvailableQuantity() {
            const sel = document.getElementById('windhoekProduct-legacy');
            const display = document.getElementById('windhoekAvailableQty-legacy');
            if (!sel || !display) return;
            const name = sel.value;
            if (!name) { display.value = 'Select product'; return; }
            display.value = calculateAvailableQuantity(name, 'country');
        }

        function displayWindhoekStock() {
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                return loc.includes('windhoek') || loc === 'windhoek_warehouse';
            });
            _renderStockTable(batches, 'windhoekStockList');
            if (typeof showToast === 'function') showToast('Windhoek inventory refreshed (' + batches.length + ' items)');
        }

        function showLowStockWindhoek() {
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                if (!loc.includes('windhoek') && loc !== 'windhoek_warehouse') return false;
                const qty = Number(b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0);
                return qty < 10;
            });
            _renderStockTable(batches, 'windhoekStockList');
            if (typeof showToast === 'function') showToast('Showing ' + batches.length + ' low stock items');
        }

        function searchWindhoekStock() {
            const term = (document.getElementById('windhoekSearch')?.value || '').toLowerCase();
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                if (!loc.includes('windhoek') && loc !== 'windhoek_warehouse') return false;
                if (!term) return true;
                return (b.description || b.productName || '').toLowerCase().includes(term);
            });
            _renderStockTable(batches, 'windhoekStockList');
        }

        function loadOndangwaProducts() {
            _populateProductSelect('ondangwaProduct', 'country');
            _populateProductSelect('ondangwaProductNew', 'country');
        }

        function updateOndangwaAvailableQuantity() {
            const sel = document.getElementById('ondangwaProduct');
            const display = document.getElementById('ondangwaAvailableQty');
            if (sel && display) {
                display.value = sel.value ? calculateAvailableQuantity(sel.value, 'country') : 'Select product';
            }
            const sel2 = document.getElementById('ondangwaProductNew');
            const display2 = document.getElementById('ondangwaAvailableQtyNew');
            if (sel2 && display2) {
                display2.value = sel2.value ? calculateAvailableQuantity(sel2.value, 'country') : 'Select product';
            }
        }

        function displayOndangwaStock() {
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                return loc.includes('ondangwa') || loc === 'ondangwa_warehouse';
            });
            _renderStockTable(batches, 'ondangwaStockList');
            if (typeof showToast === 'function') showToast('Ondangwa inventory refreshed (' + batches.length + ' items)');
        }

        function showLowStockOndangwa() {
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                if (!loc.includes('ondangwa') && loc !== 'ondangwa_warehouse') return false;
                const qty = Number(b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0);
                return qty < 10;
            });
            _renderStockTable(batches, 'ondangwaStockList');
            if (typeof showToast === 'function') showToast('Showing ' + batches.length + ' low stock items');
        }

        function searchOndangwaStock() {
            const term = (document.getElementById('ondangwaSearch')?.value || '').toLowerCase();
            const batches = getBarcodeStockList().filter(b => {
                const loc = String(b.location || '').toLowerCase();
                if (!loc.includes('ondangwa') && loc !== 'ondangwa_warehouse') return false;
                if (!term) return true;
                return (b.description || b.productName || '').toLowerCase().includes(term);
            });
            _renderStockTable(batches, 'ondangwaStockList');
        }

        function loadDistributionProducts() {
            const wh = document.getElementById('distributionWarehouse')?.value || '';
            _populateProductSelect('distributionProduct', wh || undefined);
            _populateBranchSelect('distributionBranch');
        }

        function updateDistributionGuidance() {
            const guidance = document.getElementById('distributionGuidance');
            if (!guidance) return;
            const product = document.getElementById('distributionProduct')?.value || '';
            const wh = document.getElementById('distributionWarehouse')?.value || '';
            const qty = Number(document.getElementById('distributionQuantity')?.value || 0);
            if (!product || !wh) {
                guidance.textContent = 'Select warehouse, branch, and product to see suggested quantities.';
                guidance.style.color = '#64748b';
                return;
            }
            const available = calculateAvailableQuantity(product, wh);
            if (qty > available) {
                guidance.textContent = 'Warning: Requested ' + qty + ' exceeds available ' + available + ' in ' + wh + ' warehouse.';
                guidance.style.color = '#e74c3c';
            } else {
                guidance.textContent = 'Available in ' + wh + ': ' + available + ' units. Remaining after transfer: ' + (available - qty) + '.';
                guidance.style.color = '#27ae60';
            }
        }

        function displayDistributionHistory() {
            const el = document.getElementById('distributionHistoryList');
            if (!el) return;
            fetchJsonFromApi(API_BASE + '/stock/transfers?status=all&limit=50', []).then(data => {
                const items = Array.isArray(data) ? data : (data && Array.isArray(data.transfers) ? data.transfers : []);
                if (!items.length) {
                    el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No distribution history found.</p>';
                    return;
                }
                let html = '<table class="table"><thead><tr><th>ID</th><th>From</th><th>To</th><th>Status</th><th>Date</th><th>Items</th></tr></thead><tbody>';
                items.forEach(t => {
                    const itemCount = Array.isArray(t.items) ? t.items.length : 0;
                    html += '<tr>' +
                        '<td>' + (t.id || '-').substring(0, 12) + '</td>' +
                        '<td>' + (t.fromWarehouse || t.from_warehouse || '-') + '</td>' +
                        '<td>' + (t.toBranch || t.to_branch || '-') + '</td>' +
                        '<td><span class="pill ' + (t.status === 'delivered' ? 'good' : 'pending') + '">' + (t.status || 'pending') + '</span></td>' +
                        '<td>' + (t.createdAt || t.created_at || '-').substring(0, 10) + '</td>' +
                        '<td>' + itemCount + '</td></tr>';
                });
                html += '</tbody></table>';
                el.innerHTML = html;
            });
        }

        function searchDistribution() {
            const term = (document.getElementById('distributionSearch')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#distributionHistoryList tbody tr');
            rows.forEach(row => {
                row.style.display = !term || row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        }

        function filterInventoryMovements() {
            displayInventoryMovements();
        }

        function displayInventoryMovements() {
            const el = document.getElementById('inventoryMovementsList');
            if (!el) return;
            const locationFilter = document.getElementById('inventoryLocationFilter')?.value || 'all';
            const typeFilter = document.getElementById('inventoryMovementFilter')?.value || 'all';
            const search = (document.getElementById('inventoryProductSearch')?.value || '').toLowerCase();
            const dateFrom = document.getElementById('inventoryDateFrom')?.value || '';
            const dateTo = document.getElementById('inventoryDateTo')?.value || '';

            el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Loading movements...</p>';

            fetchJsonFromApi(API_BASE + '/stock-movements?limit=200', []).then(apiData => {
                let items = Array.isArray(apiData) ? apiData : [];
                if (locationFilter !== 'all') {
                    items = items.filter(m => (m.warehouseId || '').toLowerCase().includes(locationFilter));
                }
                if (typeFilter !== 'all') {
                    items = items.filter(m => (m.movementType || '').toLowerCase() === typeFilter);
                }
                if (search) {
                    items = items.filter(m => (m.productName || '').toLowerCase().includes(search));
                }
                if (dateFrom) {
                    items = items.filter(m => (m.createdAt || '') >= dateFrom);
                }
                if (dateTo) {
                    items = items.filter(m => (m.createdAt || '').substring(0, 10) <= dateTo);
                }

                if (!items.length) {
                    el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No inventory movements match the selected filters.</p>';
                    return;
                }
                let html = '<table class="table"><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Location</th><th>Reference</th><th>Notes</th></tr></thead><tbody>';
                items.forEach(m => {
                    const typeColors = { import: '#2196f3', transfer: '#9c27b0', distribution: '#ff9800', adjustment: '#607d8b', receipt: '#4caf50' };
                    const color = typeColors[(m.movementType || '').toLowerCase()] || '#607d8b';
                    html += '<tr>' +
                        '<td>' + (m.createdAt || '-').substring(0, 10) + '</td>' +
                        '<td>' + (m.productName || '-') + '</td>' +
                        '<td><span style="background:' + color + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:0.85rem;">' + (m.movementType || '-') + '</span></td>' +
                        '<td style="font-weight:bold;">' + (m.quantity || 0) + '</td>' +
                        '<td>' + (m.warehouseId || '-') + '</td>' +
                        '<td>' + (m.reference || '-') + '</td>' +
                        '<td>' + (m.notes || '-') + '</td></tr>';
                });
                html += '</tbody></table>';
                el.innerHTML = html;
            });
        }

        function exportInventoryMovements() {
            const table = document.querySelector('#inventoryMovementsList table');
            if (!table) { showToast('No data to export'); return; }
            let csv = [];
            table.querySelectorAll('tr').forEach(row => {
                const cells = [];
                row.querySelectorAll('th, td').forEach(cell => cells.push('"' + (cell.textContent || '').replace(/"/g, '""') + '"'));
                csv.push(cells.join(','));
            });
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'inventory_movements_' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            showToast('Inventory movements exported');
        }

        async function handleStockTransfer(event) {
            if (event) event.preventDefault();
            const fromLoc = document.getElementById('transferFromLocation')?.value;
            const toLoc = document.getElementById('transferToLocation')?.value;
            const toBranch = document.getElementById('transferBranch')?.value;
            const product = document.getElementById('transferProduct')?.value;
            const qty = Number(document.getElementById('transferQuantity-ondangwa')?.value || 0);
            const reason = document.getElementById('transferReason-ondangwa')?.value || 'replenishment';

            if (!fromLoc || !toLoc || !product || qty <= 0) {
                showToast('Please fill in all required fields');
                return;
            }
            const destination = toLoc === 'branch' ? toBranch : toLoc;
            if (!destination) { showToast('Please select a destination'); return; }

            try {
                const resp = await fetch(API_BASE + '/stock/transfers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        fromWarehouse: fromLoc,
                        toBranch: destination,
                        items: [{ productName: product, productId: product, quantity: qty }],
                        notes: reason,
                        status: 'pending'
                    })
                });
                const result = await resp.json();
                if (result && (result.success !== false)) {
                    showToast('Transfer created successfully');
                    document.getElementById('stockTransferForm')?.reset();
                    loadStockTransfers();
                } else {
                    showToast('Transfer failed: ' + (result.error || 'Unknown error'));
                }
            } catch (e) {
                showToast('Transfer error: ' + e.message);
            }
        }

        function loadTransferFromProducts() {
            const fromLoc = document.getElementById('transferFromLocation')?.value || '';
            _populateProductSelect('transferProduct', fromLoc || undefined);
            const branchDiv = document.getElementById('transferBranchSelect');
            if (branchDiv) {
                branchDiv.style.display = document.getElementById('transferToLocation')?.value === 'branch' ? 'block' : 'none';
            }
            populateTransferBranchOptions();
        }

        function loadStockTransfers() {
            const el = document.getElementById('stockTransferHistory');
            if (!el) return;
            const statusFilter = document.getElementById('transferStatusFilter')?.value || 'all';
            fetchJsonFromApi(API_BASE + '/stock/transfers?status=' + statusFilter + '&limit=100', []).then(data => {
                const items = Array.isArray(data) ? data : (data && Array.isArray(data.transfers) ? data.transfers : []);
                if (!items.length) {
                    el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No transfers found.</p>';
                    return;
                }
                let html = '<table class="table"><thead><tr><th>ID</th><th>From</th><th>To</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
                items.forEach(t => {
                    const statusClass = t.status === 'delivered' ? 'good' : t.status === 'dispatched' ? 'warning' : 'pending';
                    html += '<tr>' +
                        '<td>' + (t.id || '-').substring(0, 12) + '</td>' +
                        '<td>' + (t.fromWarehouse || t.from_warehouse || '-') + '</td>' +
                        '<td>' + (t.toBranch || t.to_branch || '-') + '</td>' +
                        '<td><span class="pill ' + statusClass + '">' + (t.status || 'pending') + '</span></td>' +
                        '<td>' + (t.createdAt || t.created_at || '-').substring(0, 10) + '</td>' +
                        '<td><button class="btn btn-sm" onclick="viewTransferDetails(\'' + t.id + '\')">View</button></td></tr>';
                });
                html += '</tbody></table>';
                el.innerHTML = html;
            });
        }

        function viewTransferDetails(transferId) {
            showToast('Transfer details: ' + transferId);
        }

        function populateTransferBranchOptions() {
            _populateBranchSelect('transferBranch');
        }

        async function handleSharingRule(event) {
            if (event) event.preventDefault();
            const form = event?.target;
            const sourceEl = form?.querySelector('[id*="sharingSource"]') || document.getElementById('sharingSource');
            const targetEl = form?.querySelector('[id*="sharingTarget"]') || document.getElementById('sharingTarget');
            const source = sourceEl?.value || '';
            const target = targetEl?.value || '';
            if (!source || !target) { showToast('Select both source and target locations'); return; }
            const rules = JSON.parse(localStorage.getItem('dyna_sharing_rules') || '[]');
            rules.push({ id: 'SHARE-' + Date.now(), source, target, createdAt: new Date().toISOString(), status: 'active' });
            localStorage.setItem('dyna_sharing_rules', JSON.stringify(rules));
            showToast('Sharing rule created: ' + source + ' → ' + target);
            loadShopWarehouseSharing();
            form?.reset();
        }

        function loadShopWarehouseSharing() {
            const rules = JSON.parse(localStorage.getItem('dyna_sharing_rules') || '[]');
            const el = document.getElementById('sharingRulesList');
            if (!el) return;
            if (!rules.length) {
                el.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">No sharing rules configured.</p>';
                return;
            }
            let html = '<table class="table"><thead><tr><th>Source</th><th>Target</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>';
            rules.forEach(r => {
                html += '<tr><td>' + r.source + '</td><td>' + r.target + '</td>' +
                    '<td><span class="pill good">' + r.status + '</span></td>' +
                    '<td>' + (r.createdAt || '-').substring(0, 10) + '</td>' +
                    '<td><button class="btn btn-sm btn-danger" onclick="removeSharingRule(\'' + r.id + '\')">Remove</button></td></tr>';
            });
            html += '</tbody></table>';
            el.innerHTML = html;
        }

        function removeSharingRule(ruleId) {
            let rules = JSON.parse(localStorage.getItem('dyna_sharing_rules') || '[]');
            rules = rules.filter(r => r.id !== ruleId);
            localStorage.setItem('dyna_sharing_rules', JSON.stringify(rules));
            loadShopWarehouseSharing();
            showToast('Sharing rule removed');
        }

        function displayCountryStockInventory() {
            const locationFilter = document.getElementById('countryInvLocationFilter')?.value || 'all';
            const productFilter = document.getElementById('countryInvProductFilter')?.value || 'all';
            const el = document.getElementById('countryInventoryTable');
            if (!el) return;

            const batches = getBarcodeStockList();
            let filtered = batches;
            if (locationFilter !== 'all') {
                filtered = filtered.filter(b => {
                    const loc = String(b.location || '').toLowerCase();
                    if (locationFilter === 'country') return loc.includes('country') || loc === 'country_stock';
                    if (locationFilter === 'windhoek') return loc.includes('windhoek');
                    if (locationFilter === 'ondangwa') return loc.includes('ondangwa');
                    if (locationFilter === 'branches') return !loc.includes('country') && !loc.includes('windhoek') && !loc.includes('ondangwa');
                    return true;
                });
            }
            if (productFilter !== 'all') {
                filtered = filtered.filter(b => (b.description || b.productName || '') === productFilter);
            }

            const countryBatches = batches.filter(b => (b.location || '').toLowerCase().includes('country'));
            const whkBatches = batches.filter(b => (b.location || '').toLowerCase().includes('windhoek'));
            const ondBatches = batches.filter(b => (b.location || '').toLowerCase().includes('ondangwa'));
            const branchBatches = batches.filter(b => {
                const loc = (b.location || '').toLowerCase();
                return !loc.includes('country') && !loc.includes('windhoek') && !loc.includes('ondangwa');
            });

            const sumQty = (arr) => arr.reduce((s, b) => s + Number(b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0), 0);
            const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            setEl('countryTotalValue', sumQty(countryBatches) + ' units');
            setEl('warehouseTotalValue', (sumQty(whkBatches) + sumQty(ondBatches)) + ' units');
            setEl('branchTotalValue', sumQty(branchBatches) + ' units');
            setEl('countryTotalProducts', new Set(batches.map(b => b.description || b.productName || '')).size);

            const prodSelect = document.getElementById('countryInvProductFilter');
            if (prodSelect && prodSelect.options.length <= 1) {
                const names = [...new Set(batches.map(b => b.description || b.productName || '').filter(Boolean))].sort();
                names.forEach(n => {
                    const opt = document.createElement('option');
                    opt.value = n; opt.textContent = n;
                    prodSelect.appendChild(opt);
                });
            }

            _renderStockTable(filtered, 'countryInventoryTable');
        }

        function exportCountryInventory() {
            const table = document.querySelector('#countryInventoryTable table');
            if (!table) { showToast('No data to export'); return; }
            let csv = [];
            table.querySelectorAll('tr').forEach(row => {
                const cells = [];
                row.querySelectorAll('th, td').forEach(cell => cells.push('"' + (cell.textContent || '').replace(/"/g, '""') + '"'));
                csv.push(cells.join(','));
            });
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'country_inventory_' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            showToast('Country inventory exported');
        }

        function renderInventoryTimelyReport(period) {
            period = period || document.getElementById('inventoryTimelyRange')?.value || 'monthly';
            const batches = getBarcodeStockList();
            const now = new Date();
            let startDate;
            if (period === 'daily') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            else if (period === 'weekly') startDate = new Date(now - 7 * 86400000);
            else if (period === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            else if (period === 'quarterly') startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            else startDate = new Date(now.getFullYear(), 0, 1);

            const recentBatches = batches.filter(b => {
                const d = new Date(b.import_date || b.createdAt || b.created_at || 0);
                return d >= startDate;
            });

            const totalReceived = recentBatches.reduce((s, b) => s + Number(b.quantity ?? 0), 0);
            const totalDispatched = recentBatches.reduce((s, b) => s + Number(b.dispatchedQuantity ?? b.dispatched_quantity ?? 0), 0);

            const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            const setMeta = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            setVal('inventoryReportReceived', totalReceived);
            setMeta('inventoryReportReceivedMeta', recentBatches.length + ' batches in ' + period + ' period');
            setVal('inventoryReportSold', totalDispatched);
            setMeta('inventoryReportSoldMeta', 'Dispatched from stock');
            setVal('inventoryReportFieldSales', 0);
            setMeta('inventoryReportFieldSalesMeta', 'No field sales data');
            setVal('inventoryReportConsultantSales', 0);
            setMeta('inventoryReportConsultantSalesMeta', 'No consultant sales data');
        }

        function handleQualitySubmit(event) {
            if (event) event.preventDefault();
            const form = event.target;
            const batchInput = form.querySelector('[id^="qcBatch"]');
            const asnInput = form.querySelector('[id^="qcAsn"]');
            const dateInput = form.querySelector('[id^="qcDate"]');
            const tempInput = form.querySelector('[id^="qcTemperature"]');
            const visualInput = form.querySelector('[id^="qcVisual"]') || form.querySelector('[id^="qcResult"]');
            const batchNo = batchInput?.value || '';
            if (!batchNo) { showToast('Batch number is required'); return; }

            const qcRecords = JSON.parse(localStorage.getItem('dyna_qc_records') || '[]');
            qcRecords.push({
                id: 'QC-' + Date.now(),
                batchNo,
                asnRef: asnInput?.value || '',
                date: dateInput?.value || new Date().toISOString().slice(0, 10),
                temperature: tempInput?.value || 'ambient',
                visual: visualInput?.value || 'pass',
                status: 'inspected',
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('dyna_qc_records', JSON.stringify(qcRecords));
            showToast('Quality check recorded for batch ' + batchNo);
            form.reset();

            const qualityList = document.getElementById('qualityList');
            if (qualityList) {
                let html = '';
                qcRecords.slice(-10).reverse().forEach(r => {
                    html += '<div style="padding:8px;margin-bottom:6px;background:#f0f7ff;border-radius:6px;border-left:3px solid #2196f3;">' +
                        '<strong>' + r.batchNo + '</strong> - ' + r.visual + ' <small style="color:#888;">' + r.date + '</small></div>';
                });
                qualityList.innerHTML = html || '<div class="hub-activity-empty">No quality inspections yet</div>';
            }
        }

        async function handleBranchDistribution(event) {
            if (event) event.preventDefault();
            const source = document.getElementById('branchDistSourceWarehouse')?.value;
            const dest = document.getElementById('branchDistDestination')?.value;
            const product = document.getElementById('branchDistProduct')?.value;
            const qty = Number(document.getElementById('branchDistQuantity')?.value || 0);
            const priority = document.getElementById('branchDistPriority')?.value || 'normal';
            const notes = document.getElementById('branchDistNotes')?.value || '';
            if (!source || !dest || !product || qty <= 0) { showToast('Please fill all required fields'); return; }

            try {
                const resp = await fetch(API_BASE + '/stock/transfers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        fromWarehouse: source,
                        toBranch: dest,
                        items: [{ productName: product, productId: product, quantity: qty }],
                        notes: priority + ': ' + notes,
                        status: 'pending'
                    })
                });
                const result = await resp.json();
                if (result && result.success !== false) {
                    showToast('Distribution to branch created successfully');
                    document.getElementById('branchDistributionForm')?.reset();
                    loadBranchDistributionHistory();
                } else {
                    showToast('Distribution failed: ' + (result.error || 'Unknown error'));
                }
            } catch (e) {
                showToast('Distribution error: ' + e.message);
            }
        }

        function loadBranchDistributionHistory() {
            const el = document.getElementById('branchDistributionHistory');
            if (!el) return;
            fetchJsonFromApi(API_BASE + '/stock/transfers?status=all&limit=50', []).then(data => {
                const items = Array.isArray(data) ? data : (data && Array.isArray(data.transfers) ? data.transfers : []);
                const branchTransfers = items.filter(t => t.toBranch || t.to_branch);
                if (!branchTransfers.length) {
                    el.innerHTML = '<p style="text-align:center;padding:15px;color:#666;">No branch distributions yet.</p>';
                    return;
                }
                let html = '<table class="table"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>';
                branchTransfers.slice(0, 20).forEach(t => {
                    html += '<tr><td>' + (t.createdAt || t.created_at || '-').substring(0, 10) + '</td>' +
                        '<td>' + (t.fromWarehouse || t.from_warehouse || '-') + '</td>' +
                        '<td>' + (t.toBranch || t.to_branch || '-') + '</td>' +
                        '<td><span class="pill ' + (t.status === 'delivered' ? 'good' : 'pending') + '">' + (t.status || 'pending') + '</span></td></tr>';
                });
                html += '</tbody></table>';
                el.innerHTML = html;
            });
        }

        function loadBranchesForDistribution() {
            _populateBranchSelect('distributionBranch');
            _populateBranchSelect('branchDistDestination');
        }

        function populateBranchDistributionProducts() {
            _populateProductSelect('branchDistProduct', undefined);
        }

        function loadStockOrders() {
            const orders = JSON.parse(localStorage.getItem('dyna_manual_orders') || '[]');
            const autoEl = document.getElementById('automaticOrdersList');
            const manualEl = document.getElementById('manualOrdersList');

            if (autoEl) {
                const batches = getBarcodeStockList();
                const lowStock = batches.filter(b => Number(b.remainingQuantity ?? b.remaining_quantity ?? b.quantity ?? 0) < 10);
                if (lowStock.length) {
                    let html = '';
                    lowStock.slice(0, 10).forEach(b => {
                        html += '<div style="padding:10px;margin-bottom:8px;background:#fff3e0;border-radius:8px;border-left:3px solid #ff9800;">' +
                            '<strong>' + (b.description || b.productName) + '</strong> - ' +
                            '<span style="color:#e74c3c;font-weight:bold;">' + (b.remainingQuantity ?? b.quantity ?? 0) + ' left</span>' +
                            ' at ' + (b.location || 'Unknown') +
                            '</div>';
                    });
                    autoEl.innerHTML = html;
                } else {
                    autoEl.innerHTML = '<p style="color:#27ae60;text-align:center;padding:15px;">All stock levels are healthy.</p>';
                }
            }

            if (manualEl) {
                if (!orders.length) {
                    manualEl.innerHTML = '<p style="color:#7f8c8d;text-align:center;">No manual orders created.</p>';
                    return;
                }
                let html = '';
                orders.slice(-10).reverse().forEach(o => {
                    html += '<div style="padding:10px;margin-bottom:8px;background:#f0f7ff;border-radius:8px;border-left:3px solid #2196f3;">' +
                        '<strong>' + (o.product || 'Product') + '</strong> × ' + (o.quantity || 0) +
                        ' → ' + (o.branch || 'All') +
                        ' <small style="color:#888;">' + (o.createdAt || '-').substring(0, 10) + '</small>' +
                        ' <span class="pill ' + (o.status === 'fulfilled' ? 'good' : 'pending') + '">' + (o.status || 'pending') + '</span>' +
                        '</div>';
                });
                manualEl.innerHTML = html;
            }
        }

        function toggleSelectAllInvoices(checked) {
            document.querySelectorAll('#invoiceReportTableBody input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
        }

        function populateInvoiceBranchFilter() {
            _populateBranchSelect('invoiceBranchFilter');
        }

        window.loadWindhoekProducts = loadWindhoekProducts;
        window.updateWindhoekAvailableQuantity = updateWindhoekAvailableQuantity;
        window.displayWindhoekStock = displayWindhoekStock;
        window.showLowStockWindhoek = showLowStockWindhoek;
        window.searchWindhoekStock = searchWindhoekStock;
        window.loadOndangwaProducts = loadOndangwaProducts;
        window.updateOndangwaAvailableQuantity = updateOndangwaAvailableQuantity;
        window.displayOndangwaStock = displayOndangwaStock;
        window.showLowStockOndangwa = showLowStockOndangwa;
        window.searchOndangwaStock = searchOndangwaStock;
        window.loadDistributionProducts = loadDistributionProducts;
        window.updateDistributionGuidance = updateDistributionGuidance;
        window.displayDistributionHistory = displayDistributionHistory;
        window.searchDistribution = searchDistribution;
        window.filterInventoryMovements = filterInventoryMovements;
        window.displayInventoryMovements = displayInventoryMovements;
        window.exportInventoryMovements = exportInventoryMovements;
        window.handleStockTransfer = handleStockTransfer;
        window.loadTransferFromProducts = loadTransferFromProducts;
        window.loadStockTransfers = loadStockTransfers;
        window.viewTransferDetails = viewTransferDetails;
        window.populateTransferBranchOptions = populateTransferBranchOptions;
        window.handleSharingRule = handleSharingRule;
        window.loadShopWarehouseSharing = loadShopWarehouseSharing;
        window.removeSharingRule = removeSharingRule;
        window.displayCountryStockInventory = displayCountryStockInventory;
        window.exportCountryInventory = exportCountryInventory;
        window.renderInventoryTimelyReport = renderInventoryTimelyReport;
        window.handleQualitySubmit = handleQualitySubmit;
        window.handleBranchDistribution = handleBranchDistribution;
        window.loadBranchDistributionHistory = loadBranchDistributionHistory;
        window.loadBranchesForDistribution = loadBranchesForDistribution;
        window.populateBranchDistributionProducts = populateBranchDistributionProducts;
        window.loadStockOrders = loadStockOrders;
        window.toggleSelectAllInvoices = toggleSelectAllInvoices;
        window.populateInvoiceBranchFilter = populateInvoiceBranchFilter;

        async function handleTransferToWindhoek(event) {
            if (event) event.preventDefault();
            const form = event.target;
            const productEl = form.querySelector('[id*="windhoekProduct"]') || form.querySelector('select[required]');
            const qtyEl = form.querySelector('[id*="windhoekQuantity"]') || form.querySelector('input[type="number"]');
            const notesEl = form.querySelector('[id*="windhoekNotes"]') || form.querySelector('textarea');
            const product = productEl?.value || '';
            const qty = Number(qtyEl?.value || 0);
            if (!product || qty <= 0) { showToast('Select a product and enter quantity'); return; }
            try {
                const resp = await fetch(API_BASE + '/stock/transfers', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ fromWarehouse: 'country_stock', toBranch: 'windhoek_warehouse', items: [{ productName: product, productId: product, quantity: qty }], notes: notesEl?.value || '', status: 'pending' })
                });
                const result = await resp.json();
                if (result && result.success !== false) { showToast('Transfer to Windhoek created'); form.reset(); displayWindhoekStock(); }
                else showToast('Transfer failed: ' + (result.error || 'Unknown error'));
            } catch (e) { showToast('Error: ' + e.message); }
        }

        async function handleTransferToOndangwa(event) {
            if (event) event.preventDefault();
            const form = event.target;
            const productEl = form.querySelector('[id*="ondangwaProduct"]') || form.querySelector('select[required]');
            const qtyEl = form.querySelector('[id*="ondangwaQuantity"]') || form.querySelector('input[type="number"]');
            const notesEl = form.querySelector('[id*="ondangwaNotes"]') || form.querySelector('textarea');
            const product = productEl?.value || '';
            const qty = Number(qtyEl?.value || 0);
            if (!product || qty <= 0) { showToast('Select a product and enter quantity'); return; }
            try {
                const resp = await fetch(API_BASE + '/stock/transfers', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ fromWarehouse: 'country_stock', toBranch: 'ondangwa_warehouse', items: [{ productName: product, productId: product, quantity: qty }], notes: notesEl?.value || '', status: 'pending' })
                });
                const result = await resp.json();
                if (result && result.success !== false) { showToast('Transfer to Ondangwa created'); form.reset(); displayOndangwaStock(); }
                else showToast('Transfer failed: ' + (result.error || 'Unknown error'));
            } catch (e) { showToast('Error: ' + e.message); }
        }

        async function handleDistributeStock(event) {
            if (event) event.preventDefault();
            const wh = document.getElementById('distributionWarehouse')?.value;
            const branch = document.getElementById('distributionBranch')?.value;
            const product = document.getElementById('distributionProduct')?.value;
            const qty = Number(document.getElementById('distributionQuantity')?.value || 0);
            const date = document.getElementById('distributionDate')?.value || '';
            const expiry = document.getElementById('distributionExpiryDate')?.value || '';
            const dispatch = document.getElementById('distributionDispatchNumber')?.value || '';
            const notes = document.getElementById('distributionNotes')?.value || '';
            if (!wh || !branch || !product || qty <= 0) { showToast('Please fill all required fields'); return; }
            try {
                const resp = await fetch(API_BASE + '/stock/transfers', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ fromWarehouse: wh, toBranch: branch, dispatchReference: dispatch, items: [{ productName: product, productId: product, quantity: qty, batchNo: expiry }], notes: notes, status: 'pending' })
                });
                const result = await resp.json();
                if (result && result.success !== false) { showToast('Distribution to branch created'); document.getElementById('distributeStockForm')?.reset(); displayDistributionHistory(); }
                else showToast('Distribution failed: ' + (result.error || 'Unknown error'));
            } catch (e) { showToast('Error: ' + e.message); }
        }

        window.handleDistributeStock = handleDistributeStock;
        window.handleTransferToWindhoek = handleTransferToWindhoek;
        window.handleTransferToOndangwa = handleTransferToOndangwa;

        window.showFrontdeskCRMTab = showFrontdeskCRMTab;
        
        function populateBranchFilters() {
            const branchList = getCachedBranches();
            const selects = ['reportBranchFilter', 'salesBranchFilter'];
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (!select) return;
                const currentValue = select.value;
                select.innerHTML = '<option value="all">All Branches</option>';
                branchList.forEach(branch => {
                    if (!branch) return;
                    const option = document.createElement('option');
                    const value = branch.id || branch.branchId || branch.code || branch.name;
                    option.value = value || '';
                    option.textContent = branch.name || branch.branchName || branch.displayName || branch.code || value || 'Unnamed Branch';
                    select.appendChild(option);
                });
                if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
                    select.value = currentValue;
                }
            });
        }
        
        function generateCustomReport() {
            const reportName = document.getElementById('reportName')?.value || 'Custom Report';
            const dateRange = document.getElementById('reportDateRange')?.value || 'month';
            const output = document.getElementById('customReportOutput');
            if (!output) return;
            
            output.innerHTML = '<p>Generating report...</p>';
            setTimeout(() => {
                output.innerHTML = `<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                    <h4>${reportName}</h4>
                    <p>Report generated successfully. Use Export buttons to download.</p>
                </div>`;
            }, 500);
        }
        
        function refreshSalesAnalytics() {
            const output = document.getElementById('salesAnalyticsOutput');
            if (!output) return;
            output.innerHTML = '<p>Loading sales analytics...</p>';
            setTimeout(() => {
                output.innerHTML = '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;"><h4>Sales Analytics</h4><p>Sales data visualization will appear here.</p></div>';
            }, 500);
        }
        
        function refreshPatientAnalytics() {
            const output = document.getElementById('patientAnalyticsOutput');
            if (!output) return;
            output.innerHTML = '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;"><h4>Patient Analytics</h4><p>Patient metrics and demographics will appear here.</p></div>';
        }
        
        function refreshProductAnalytics() {
            const output = document.getElementById('productAnalyticsOutput');
            if (!output) return;
            output.innerHTML = '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;"><h4>Product Performance</h4><p>Top-selling products and performance metrics will appear here.</p></div>';
        }
        
        function refreshBranchComparison() {
            const output = document.getElementById('branchComparisonOutput');
            if (!output) return;
            output.innerHTML = '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;"><h4>Branch Comparison</h4><p>Branch performance comparison will appear here.</p></div>';
        }
        
        function refreshTrendAnalysis() {
            const output = document.getElementById('trendAnalysisOutput');
            if (!output) return;
            output.innerHTML = '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px;"><h4>Trend Analysis</h4><p>Trend charts and analysis will appear here.</p></div>';
        }
        
        function exportReportToExcel() {
            alert('Excel export functionality will be implemented.');
        }
        
        function exportReportToPDF() {
            alert('PDF export functionality will be implemented.');
        }
        
        function gatherPortalSummary(portal){
            try{
                if (portal==='gm'){
                    const rev = document.getElementById('gmTotalRevenue')?.textContent||'';
                    const cif = document.getElementById('gmCIFDeposits')?.textContent||'';
                    const bv = document.getElementById('gmTotalBV')?.textContent||'';
                    const margin = document.getElementById('gmGrossMargin')?.textContent||'';
                    return `GM Summary\nRevenue: ${rev}\nCIF: ${cif}\nBV: ${bv}\nMargin: ${margin}`;
                }
                if (portal==='director'){
                    const rev = document.getElementById('directorRevenue')?.textContent||'';
                    const cif = document.getElementById('directorCIF')?.textContent||'';
                    const bv = document.getElementById('directorBV')?.textContent||'';
                    const margin = document.getElementById('directorMargin')?.textContent||'';
                    const rem = document.getElementById('directorRemittance')?.textContent||'';
                    return `Director Summary\nRevenue: ${rev}\nCIF: ${cif}\nBV: ${bv}\nMargin: ${margin}\nRemittance: ${rem}`;
                }
            } catch(_){}
            return 'Summary unavailable.';
        }
        async function notifyScheduledReport(portal){
            try {
                await fetch('/api/notifications', { method:'POST', headers:{ 'Content-Type':'application/json','x-role': getCurrentUserRole() }, body: JSON.stringify({ type:'report', title:`${portal.toUpperCase()} report sent`, message:new Date().toLocaleString() }) });
            } catch(_){}
        }
        function sendReportNow(){
            const portal = document.getElementById('schedulePortal').value;
            composeReportEmail(portal);
            notifyScheduledReport(portal);
        }
        // naive client-side scheduler (active while page is open)
        setInterval(() => {
            try{
                const schedules = JSON.parse(localStorage.getItem('report_schedules')||'{}');
                const now = new Date();
                Object.entries(schedules).forEach(([portal, cfg]) => {
                    if (!cfg || !cfg.frequency) return;
                    const lastKey = `last_sent_${portal}`;
                    const last = localStorage.getItem(lastKey);
                    const shouldSend =
                        (cfg.frequency==='daily' && (!last || now - new Date(last) > 24*3600*1000)) ||
                        (cfg.frequency==='weekly' && (!last || now - new Date(last) > 7*24*3600*1000)) ||
                        (cfg.frequency==='monthly' && (!last || now - new Date(last) > 30*24*3600*1000));
                    if (shouldSend) {
                        composeReportEmail(portal);
                        notifyScheduledReport(portal);
                        localStorage.setItem(lastKey, new Date().toISOString());
                    }
                });
            } catch(_){}
        }, 60000);
    
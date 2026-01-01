
import { items } from '../data.js';

export function createItemModal(itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animate-fade-in';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0, 0, 0, 0.6)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.className = 'glass-panel modal-content';
    modal.style.width = '800px';
    modal.style.maxWidth = '90%';
    modal.style.height = '85vh';
    modal.style.background = '#181b21'; // Solid mock bg to cover content
    modal.style.border = '1px solid var(--border-subtle)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.position = 'relative';
    modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.5)';

    // Close Handler
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });

    // HEADER
    const header = document.createElement('div');
    header.style.padding = '1.5rem';
    header.style.borderBottom = '1px solid var(--border-subtle)';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
             <div style="padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
                ${getIconForType(item.type)}
             </div>
             <div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${item.type}</div>
                <h2 style="font-size: 1.25rem; font-weight: 600;">${item.title}</h2>
             </div>
        </div>
        <button class="close-btn btn icon-only" style="background: transparent; color: var(--text-secondary);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
    `;
    modal.appendChild(header);

    // CONTENT BODY
    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.overflowY = 'auto';
    body.style.padding = '2rem';

    if (item.type === 'note') {
        body.innerHTML = `
            <div style="font-family: 'Courier New', monospace; line-height: 1.6; color: var(--text-primary);">
                ${item.content.replace(/\n/g, '<br>').replace(/# (.*)/g, '<h1 style="font-family: var(--font-sans); margin-bottom:1rem;">$1</h1>').replace(/## (.*)/g, '<h2 style="font-family: var(--font-sans); margin-top:1.5rem; margin-bottom:0.5rem;">$1</h2>')}
            </div>
        `;
    } else if (item.type === 'link') {
        body.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2rem;">
                <!-- URL Preview Card -->
                <div style="border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; background: var(--bg-app);">
                    <div style="height: 200px; background: linear-gradient(135deg, #2d3748, #1a202c); display: flex; align-items: center; justify-content: center;">
                         <span style="color: var(--text-muted);">Website Preview Image</span>
                    </div>
                    <div style="padding: 1.5rem;">
                         <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">${item.title}</h3>
                         <div style="color: var(--text-muted); margin-bottom: 1.5rem;">${item.meta?.description || 'No description available.'}</div>
                         <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path></svg>
                            <a href="${item.url}" target="_blank" style="color: inherit; text-decoration: none;">${item.meta?.domain || item.url}</a>
                         </div>
                    </div>
                </div>

                <!-- Related Mock Data -->
                <div>
                    <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-secondary);">Linked Notes (0)</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">No notes linked to this URL yet.</p>
                </div>
            </div>
        `;
    } else {
        // Fallback for PDF/Video
        body.innerHTML = `
            <div style="text-align: center; padding: 4rem;">
                <p style="margin-bottom: 1rem; color: var(--text-primary); font-size: 1.1rem;">Preview not available for this file type.</p>
                <div style="display: flex; justify-content: center; gap: 1rem;">
                    <button class="btn">Download</button>
                    ${item.url ? `<a href="${item.url}" target="_blank" class="btn" style="text-decoration:none; background: var(--bg-panel); border:1px solid var(--border-subtle);">Open External</a>` : ''}
                </div>
            </div>
        `;
    }
    modal.appendChild(body);
    
    // Close delegation
    setTimeout(() => {
        modal.querySelector('.close-btn').addEventListener('click', close);
    }, 0);

    overlay.appendChild(modal);
    return overlay;
}

function getIconForType(type) {
  // Simple check
  if (type === 'note') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>';
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
}

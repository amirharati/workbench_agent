
export function createSidebar() {
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar glass-panel';
  
  const width = '260px';
  sidebar.style.width = width;
  sidebar.style.height = 'calc(100vh - 2rem)';
  sidebar.style.position = 'fixed';
  sidebar.style.top = '1rem';
  sidebar.style.left = '1rem';
  sidebar.style.display = 'flex';
  sidebar.style.flexDirection = 'column';
  sidebar.style.padding = '1.5rem';
  sidebar.style.zIndex = '100';

  // Logo
  const logo = document.createElement('div');
  logo.className = 'logo';
  logo.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem;">
      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, var(--primary), var(--accent-purple)); border-radius: 8px;"></div>
      <span style="font-family: 'Outfit'; font-weight: 700; font-size: 1.25rem;">SuperApp</span>
    </div>
  `;
  sidebar.appendChild(logo);

  // Nav Links
  const nav = document.createElement('nav');
  nav.style.display = 'flex';
  nav.style.flexDirection = 'column';
  nav.style.gap = '0.5rem';

  const menuItems = [
    { name: 'Home', icon: 'home', active: true },
    { name: 'Projects', icon: 'folder', active: false },
    { name: 'Search', icon: 'search', active: false },
    { name: 'AI Assistant', icon: 'sparkles', active: false },
  ];

  menuItems.forEach(item => {
    const link = document.createElement('a');
    link.href = '#';
    link.className = `nav-item ${item.active ? 'active' : ''}`;
    link.style.display = 'flex';
    link.style.alignItems = 'center';
    link.style.gap = '0.75rem';
    link.style.padding = '0.75rem 1rem';
    link.style.borderRadius = 'var(--radius-sm)';
    link.style.textDecoration = 'none';
    link.style.color = item.active ? 'var(--text-primary)' : 'var(--text-secondary)';
    link.style.background = item.active ? 'rgba(99, 102, 241, 0.1)' : 'transparent';
    link.style.transition = 'all 0.2s ease';
    link.style.fontSize = '0.95rem';
    link.style.fontWeight = item.active ? '500' : '400';

    // Mock Icons (using simple SVG or placeholder)
    // For now, simple text or emojis if no SVG lib
    // using lucide-like svg strings ideally, but keeping it simple for mock
    let iconSvg = '';
    if(item.icon === 'home') iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
    if(item.icon === 'folder') iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';
    if(item.icon === 'search') iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>';
    if(item.icon === 'sparkles') iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>';

    link.innerHTML = `
      ${iconSvg}
      <span>${item.name}</span>
    `;
    
    // Hover effect logic
    link.addEventListener('mouseenter', () => {
      if(!item.active) {
        link.style.color = 'var(--text-primary)';
        link.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });
    link.addEventListener('mouseleave', () => {
      if(!item.active) {
        link.style.color = 'var(--text-secondary)';
        link.style.background = 'transparent';
      }
    });

    nav.appendChild(link);
  });
  sidebar.appendChild(nav);

  // Bottom section (Settings/Profile)
  const bottom = document.createElement('div');
  bottom.style.marginTop = 'auto';
  bottom.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-top: 1px solid var(--border-subtle);">
      <div style="width: 32px; height: 32px; background: var(--bg-panel); border-radius: 50%; border: 1px solid var(--border-subtle);"></div>
      <div style="flex: 1;">
        <div style="font-size: 0.85rem; font-weight: 500;">User Name</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Pro Member</div>
      </div>
    </div>
  `;
  sidebar.appendChild(bottom);

  // Activate Sidebar Links (Mock Navigation)
  setTimeout(() => {
    const links = sidebar.querySelectorAll('.nav-item');
    // Home
    links[0].addEventListener('click', (e) => { e.preventDefault(); window.navigateTo('home'); });
    // Projects (also Home for now)
    links[1].addEventListener('click', (e) => { e.preventDefault(); window.navigateTo('home'); });
    // AI Assistant
    links[3].addEventListener('click', (e) => { e.preventDefault(); window.navigateTo('ai'); });
  }, 0);

  return sidebar;
}

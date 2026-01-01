import './style.css';
import { createSidebar } from './components/Sidebar.js';
import { createProjectDashboard } from './components/ProjectDashboard.js';
import { createItemModal } from './components/ItemModal.js';
import { createAIAssistant } from './components/AIAssistant.js';
import { projects, collections } from './data.js';

const app = document.querySelector('#app');

// Layout Shell
const layout = document.createElement('div');
layout.style.display = 'flex';
layout.style.minHeight = '100vh';
layout.style.background = 'radial-gradient(circle at top right, #1f232d 0%, #0f1115 40%)'; 

// 1. Sidebar
const sidebar = createSidebar();
layout.appendChild(sidebar);

// 2. Main Content Area
const main = document.createElement('main');
main.style.marginLeft = '260px'; // Sidebar width
main.style.width = 'calc(100% - 260px)';
main.style.padding = '2rem';
main.style.minHeight = '100vh';
main.id = 'main-content';

layout.appendChild(main);
app.appendChild(layout);

// --- Global Modal Handler ---
window.openItemModal = (itemId) => {
    const modal = createItemModal(itemId);
    if(modal) app.appendChild(modal);
};

// --- View Router Logic ---
window.navigateTo = (viewName, params = {}) => {
  main.innerHTML = '';
  
  // Sidebar Activity Update (Approximation)
  document.querySelectorAll('.nav-item').forEach(el => {
     el.classList.remove('active');
     el.style.color = 'var(--text-secondary)';
     el.style.background = 'transparent';
     el.style.fontWeight = '400';
     const text = el.innerText.toLowerCase();
     if ((viewName === 'home' && text.includes('home')) || 
         (viewName === 'project' && text.includes('projects')) ||
         (viewName === 'ai' && text.includes('ai'))) {
         el.classList.add('active');
         el.style.color = 'var(--text-primary)';
         el.style.background = 'rgba(99, 102, 241, 0.1)';
         el.style.fontWeight = '500';
     }
  });

  if (viewName === 'home') {
    renderHome();
  } else if (viewName === 'project') {
    const project = projects.find(p => p.id === params.id);
    if (project) {
        // Normal Dashboard
        main.appendChild(createProjectDashboard(project));
    }
  } else if (viewName === 'collection') {
    const collection = collections.find(c => c.id === params.id);
    if (collection) {
        const project = projects.find(p => p.id === collection.projectId);
        if(project) {
            // Dashboard in Collection Drill-down mode
            main.appendChild(createProjectDashboard(project, collection.id));
        }
    }
  } else if (viewName === 'ai') {
      main.appendChild(createAIAssistant());
  }
};

function setupBackNav() {
    setTimeout(() => {
        const backBtn = main.querySelector('.breadcrumb-home');
        if(backBtn) backBtn.addEventListener('click', () => window.navigateTo('home'));
    }, 0);
}

function renderHome() {
  const container = document.createElement('div');
  container.className = 'animate-fade-in';
  container.innerHTML = `
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem;">
      <div>
        <h1 style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">Welcome back, User</h1>
        <p style="color: var(--text-secondary);">Here's how your projects are progressing.</p>
      </div>
      <div style="display: flex; gap: 1rem;">
        <button class="btn icon-only" style="background: var(--bg-panel); border: 1px solid var(--border-subtle);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        </button>
        <button class="btn">+ New Project</button>
      </div>
    </header>

    <div style="margin-bottom: 2rem;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem;">Recent Projects</h2>
      <div class="project-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">
        <!-- Hydrated in loop below -->
      </div>
    </div>
  `;
  
  const grid = container.querySelector('.project-grid');
  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'glass-panel project-card';
    card.style.padding = '1.5rem';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s ease';
    // Hover effect via JS or CSS class
    card.onmouseenter = () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = 'var(--shadow-lg)'; };
    card.onmouseleave = () => { card.style.transform = 'none'; card.style.boxShadow = 'none'; };
    
    card.onclick = () => window.navigateTo('project', { id: p.id });

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(99, 102, 241, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>
          </div>
          <svg style="color: var(--text-secondary);" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
        </div>
        <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem; font-weight: 600;">${p.title}</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.4;">${p.description}</p>
        <div style="display: flex; gap: 0.5rem;">
          <span style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.05); border-radius: 4px; color: var(--text-secondary);">${p.stats.notes} Notes</span>
          <span style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.05); border-radius: 4px; color: var(--text-secondary);">${p.stats.collections} Collections</span>
        </div>
    `;
    grid.appendChild(card);
  });

  main.appendChild(container);
}

// Start at Home
window.navigateTo('home');

// (No change yet, need to inspect ProjectDashboard.js first)

import { collections, items } from '../data.js';

export function createProjectDashboard(project) {
  const state = {
      currentView: 'view3',
      activeCollectionId: 'all',
      activeItemId: null,
      openTabs: [],
      activeTabId: null,
      sideTabs: [],
      activeSideTabId: null,
      layoutRoot: {
          id: 'root',
          type: 'container',
          direction: 'row',
          children: [
              { id: 'sidebar', type: 'pane', width: 280, tabs: [{ id: 'list', title: 'Items', type: 'system-list' }], activeTabId: 'list' },
              { id: 'main-canvas', type: 'pane', flex: 1, tabs: [{ id: 'intro', title: 'Welcome', type: 'system-welcome' }], activeTabId: 'intro' }
          ]
      },
      view1ColWidths: [260, 320],
      view2ColWidths: [350],
      view3ColWidths: [280, 500],
      view5ColWidths: [280, 500],
      view5RightPaneVisible: false,
      view5ActivePane: 'main-top',
      view5Panes: {
          main: { isSplit: false, topTabs: [], topActiveTabId: null, bottomTabs: [], bottomActiveTabId: null, splitRatio: 50 },
          right: { isSplit: false, topTabs: [], topActiveTabId: null, bottomTabs: [], bottomActiveTabId: null, splitRatio: 50 }
      },
      view6ColWidths: [280, 500],
      view6RightPaneVisible: false,
      view6ActivePane: 'main-top',
      view6SearchQuery: '',
      view6SearchType: 'all',
      view6Panes: {
          main: { isSplit: false, topTabs: [], topActiveTabId: null, bottomTabs: [], bottomActiveTabId: null, splitRatio: 50 },
          right: { isSplit: false, topTabs: [], topActiveTabId: null, bottomTabs: [], bottomActiveTabId: null, splitRatio: 50 }
      }
  };
  
  const container = document.createElement('div');
  container.className = 'project-dashboard animate-fade-in';
  container.style.height = '100%';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  const setupResizer = (resizer, parent, colIndex, stateKey) => {
      resizer.addEventListener('mousedown', (e) => {
          e.preventDefault();
          resizer.classList.add('resizing');
          const startX = e.clientX;
          const startWidth = state[stateKey][colIndex];
          const onMouseMove = (moveEvent) => {
              const dx = moveEvent.clientX - startX;
              const newWidth = Math.max(150, startWidth + dx);
              state[stateKey][colIndex] = newWidth;
              if (stateKey === 'view1ColWidths') parent.style.gridTemplateColumns = `${state.view1ColWidths[0]}px auto ${state.view1ColWidths[1]}px auto 1fr`;
              else if (stateKey === 'view2ColWidths') parent.style.gridTemplateColumns = `${state.view2ColWidths[0]}px auto 1fr`;
              else if (stateKey === 'view3ColWidths') parent.style.gridTemplateColumns = `${state.view3ColWidths[0]}px auto ${state.view3ColWidths[1]}px auto 1fr`;
              else if (stateKey === 'view5ColWidths' || stateKey === 'view6ColWidths') {
                  const rightVisible = stateKey === 'view5ColWidths' ? state.view5RightPaneVisible : state.view6RightPaneVisible;
                  parent.style.gridTemplateColumns = rightVisible 
                      ? `${state[stateKey][0]}px auto ${state[stateKey][1]}px auto 1fr` 
                      : `${state[stateKey][0]}px auto 1fr`;
              }
          };
          const onMouseUp = () => {
              resizer.classList.remove('resizing');
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
          };
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
      });
  };

  const renderSearchTab = () => {
      const wrapper = document.createElement('div');
      wrapper.style.height = '100%';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.padding = '2rem';
      wrapper.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">Search Project</h2>
        <div style="position: relative; margin-bottom: 2rem;">
            <input type="text" id="search-input" placeholder="Type to search items..." style="width: 100%; background: var(--bg-panel); border: 1px solid var(--border-subtle); padding: 0.8rem 1rem 0.8rem 2.5rem; border-radius: var(--radius-sm); color: white; font-size: 1rem; outline: none;">
            <svg style="position: absolute; left: 0.8rem; top: 0.9rem; color: var(--text-secondary);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        </div>
        <div id="search-results" style="flex: 1; overflow-y: auto;">
            <div style="text-align: center; color: var(--text-muted); margin-top: 2rem;">Start typing...</div>
        </div>
      `;
      const input = wrapper.querySelector('#search-input');
      const resultsDiv = wrapper.querySelector('#search-results');
      input.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          if(q.length < 2) { resultsDiv.innerHTML = `<div style="text-align:center;color:var(--text-muted);">Type more...</div>`; return; }
          const matches = items.filter(i => i.projectId === project.id && (i.title.toLowerCase().includes(q) || (i.content && i.content.toLowerCase().includes(q))));
          resultsDiv.innerHTML = matches.length ? `<div style="display:flex; flex-direction:column; gap:0.5rem;">${matches.map(i=>`
             <div class="search-res" data-id="${i.id}" style="padding:1rem; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer;">
                <div style="font-weight:600;">${i.title}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${i.type} • ${i.date}</div>
             </div>`
          ).join('')}</div>` : `<div style="text-align:center;color:var(--text-muted);">No results</div>`;
          resultsDiv.querySelectorAll('.search-res').forEach(el => el.addEventListener('click', () => {
              const item = items.find(k=>k.id==el.dataset.id);
              if (state.currentView === 'view3') {
                   if(!state.openTabs.find(t=>t.id==item.id)) state.openTabs.push(item);
                   state.activeTabId = item.id;
              } else if (state.currentView === 'view6') {
                  const mainPane = state.view6Panes.main;
                  if (!mainPane.topTabs.find(t => t.id === item.id)) mainPane.topTabs.push(item);
                  mainPane.topActiveTabId = item.id;
              } else {
                   if(!state.openTabs.find(t=>t.id==item.id)) state.openTabs.push(item);
                   state.activeTabId = item.id;
              }
              render();
          }));
      });
      setTimeout(() => input.focus(), 50);
      return wrapper;
  };

  const renderAddTab = () => {
      const wrapper = document.createElement('div');
      wrapper.style.padding = '2rem';
      wrapper.innerHTML = `
         <h2>Create New</h2>
         <div style="display:flex; gap:1rem; margin-top:1rem;">
            <button class="btn" id="btn-note">New Note</button>
            <button class="btn" id="btn-col" style="background:var(--bg-panel); border:1px solid var(--border-subtle);">New Collection</button>
         </div>
         <div id="add-form" style="margin-top:2rem;"></div>
      `;
      wrapper.querySelector('#btn-note').addEventListener('click', () => {
          const title = prompt("Note Title:");
          if(title) {
              const newItem = { id: Date.now(), projectId: project.id, title, type:'note', content:'# ' + title + '\n\nNew note content...', date:'Just now' };
              items.unshift(newItem);
              if(!state.openTabs.find(t=>t.id==newItem.id)) state.openTabs.push(newItem);
              state.activeTabId = newItem.id;
              render();
          }
      });
      return wrapper;
  };

  const renderAITab = () => {
      const wrapper = document.createElement('div');
      wrapper.style.height = '100%';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.padding = '0';
      
      const messagesArea = document.createElement('div');
      messagesArea.className = 'pane-scrollable';
      messagesArea.style.flex = '1';
      messagesArea.style.padding = '1.5rem';
      messagesArea.style.display = 'flex';
      messagesArea.style.flexDirection = 'column';
      messagesArea.style.gap = '1rem';
      messagesArea.innerHTML = `
          <div style="background: rgba(99, 102, 241, 0.1); padding: 1rem; border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.2); max-width: 80%;">
              <div style="font-size: 0.75rem; color: var(--primary); margin-bottom: 0.5rem;">AI Assistant</div>
              <div style="line-height: 1.5;">Hello! I'm your AI assistant. I can help you with:
              <ul style="margin: 0.5rem 0 0 1.5rem; line-height: 1.8;">
                  <li>Summarizing your notes</li>
                  <li>Finding connections between items</li>
                  <li>Generating content ideas</li>
                  <li>Answering questions about your project</li>
              </ul></div>
          </div>
      `;
      
      const inputArea = document.createElement('div');
      inputArea.style.padding = '1rem';
      inputArea.style.borderTop = '1px solid var(--border-subtle)';
      inputArea.style.display = 'flex';
      inputArea.style.gap = '0.5rem';
      inputArea.innerHTML = `
          <input type="text" id="ai-input" placeholder="Ask me anything about your project..." 
              style="flex: 1; background: var(--bg-panel); border: 1px solid var(--border-subtle); padding: 0.8rem 1rem; border-radius: var(--radius-sm); color: white; font-size: 1rem; outline: none;">
          <button class="btn" style="padding: 0.8rem 1.5rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
      `;
      
      inputArea.querySelector('button').addEventListener('click', () => {
          const input = inputArea.querySelector('#ai-input');
          const userMessage = input.value.trim();
          if (userMessage) {
              const userBubble = document.createElement('div');
              userBubble.style.cssText = 'background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-subtle); max-width: 80%; align-self: flex-end;';
              userBubble.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">You</div><div>${userMessage}</div>`;
              messagesArea.appendChild(userBubble);
              
              setTimeout(() => {
                  const aiBubble = document.createElement('div');
                  aiBubble.style.cssText = 'background: rgba(99, 102, 241, 0.1); padding: 1rem; border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.2); max-width: 80%;';
                  aiBubble.innerHTML = `<div style="font-size: 0.75rem; color: var(--primary); margin-bottom: 0.5rem;">AI Assistant</div><div>This is a mock response. In a real implementation, this would connect to an AI API to provide intelligent responses about your project content.</div>`;
                  messagesArea.appendChild(aiBubble);
                  messagesArea.scrollTop = messagesArea.scrollHeight;
              }, 500);
              
              input.value = '';
              messagesArea.scrollTop = messagesArea.scrollHeight;
          }
      });
      
      wrapper.appendChild(messagesArea);
      wrapper.appendChild(inputArea);
      return wrapper;
  };
  
  const renderTabPane = (tabs, activeId, setActive, closeTab, wrapperClass, paneKey, stateKey) => {
      const tabsArea = document.createElement('div');
      tabsArea.className = `glass-panel ${wrapperClass || ''}`;
      tabsArea.style.display = 'flex';
      tabsArea.style.flexDirection = 'column';
      tabsArea.style.overflow = 'hidden';
      tabsArea.style.height = '100%';

      const tabsHeader = document.createElement('div');
      tabsHeader.style.display = 'flex';
      tabsHeader.style.background = 'rgba(0,0,0,0.2)';
      tabsHeader.style.borderBottom = '1px solid var(--border-subtle)';
      tabsHeader.style.padding = '0 0.5rem';
      tabsHeader.style.height = '40px';
      tabsHeader.style.alignItems = 'center';
      
      tabs.forEach(item => {
          const isActive = activeId === item.id;
          const tab = document.createElement('div');
          tab.className = `u-tab ${isActive ? 'active' : ''} draggable-tab`;
          tab.style.cssText = `padding: 0 1rem; height: 100%; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: grab; border-right: 1px solid var(--border-subtle); background: ${isActive ? 'var(--bg-panel)' : 'transparent'}; color: ${isActive ? 'var(--text-primary)' : 'var(--text-muted)'}; min-width: 100px; max-width: 180px; user-select: none;`;
          tab.innerHTML = `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${item.title}</span><span class="close-tab" style="opacity: 0.6; cursor: pointer;">×</span>`;
          
          if (paneKey && stateKey) {
              tab.draggable = true;
              tab.addEventListener('dragstart', (e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                      tabId: item.id,
                      sourcePaneKey: paneKey,
                      sourceSection: tabsArea.parentElement.querySelector('.pane-content-top') ? 'top' : 'bottom'
                  }));
                  e.dataTransfer.effectAllowed = 'move';
                  tab.style.opacity = '0.5';
                  e.dataTransfer.setData('text/plain', JSON.stringify(item));
              });
              
              tab.addEventListener('dragend', () => {
                  tab.style.opacity = '1';
              });
          }
          
          tab.addEventListener('click', (e) => {
             if (e.target.classList.contains('close-tab')) { e.stopPropagation(); closeTab(item.id); } else { setActive(item.id); }
          });
          tabsHeader.appendChild(tab);
      });

      const tabsContent = document.createElement('div');
      tabsContent.className = 'pane-scrollable pane-content-top';
      tabsContent.style.flex = '1';
      
      const activeTabItem = tabs.find(t => t.id === activeId);
      if (activeId === 'search') tabsContent.appendChild(renderSearchTab());
      else if (activeId === 'add') tabsContent.appendChild(renderAddTab());
      else if (activeId === 'ai') tabsContent.appendChild(renderAITab());
      else if (activeTabItem) {
          tabsContent.style.padding = '2rem';
          tabsContent.innerHTML = `<h1 style="margin-bottom: 1rem;">${activeTabItem.title}</h1><div style="line-height: 1.6; white-space: pre-wrap;">${activeTabItem.content || (activeTabItem.type==='link'?`<a href="${activeTabItem.url}" target="_blank" style="color:var(--primary);">${activeTabItem.url}</a>` : 'No content preview')}</div>`;
      } else {
          tabsContent.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">No tab selected</div>`;
      }
      tabsArea.appendChild(tabsHeader);
      tabsArea.appendChild(tabsContent);
      return tabsArea;
  };

  const render = () => {
      container.innerHTML = '';
      
      const header = document.createElement('header');
      header.style.flexShrink = '0';
      header.style.marginBottom = '0.5rem';
      header.style.paddingBottom = '0.5rem';
      header.style.borderBottom = '1px solid var(--border-subtle)';
      header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
               <button class="nav-back btn icon-only" style="background: transparent;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
               <h1 style="font-size: 1.5rem; font-weight: 700;">${project.title}</h1>
            </div>
            
            <div id="header-controls" style="display: flex; align-items: center; gap: 1rem;">
                <div style="background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 2px; display: flex;">
                    <button class="view-btn ${state.currentView === 'view1' ? 'active' : ''}" data-view="view1" title="Columns View">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/></svg>
                    </button>
                    <button class="view-btn ${state.currentView === 'view2' ? 'active' : ''}" data-view="view2" title="Dashboard View">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                    </button>
                    <button class="view-btn ${state.currentView === 'view3' ? 'active' : ''}" data-view="view3" title="Split Workspace">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M10 3v18"/></svg>
                    </button>
                    <button class="view-btn ${state.currentView === 'view4' ? 'active' : ''}" data-view="view4" title="Flexible Grid">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    </button>
                    <button class="view-btn ${state.currentView === 'view5' ? 'active' : ''}" data-view="view5" title="Workbench">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="6" rx="1"></rect><rect x="3" y="12" width="8" height="9" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect></svg>
                    </button>
                    <button class="view-btn ${state.currentView === 'view6' ? 'active' : ''}" data-view="view6" title="Enhanced Workbench">
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </button>
                </div>
                <button id="search-trigger" class="btn icon-only" style="background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle);" title="Search (⌘K)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                </button>
                <button id="add-trigger" class="btn icon-only" style="background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle);" title="Add New (⌘N)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button id="ai-trigger" class="btn icon-only" style="background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle);" title="AI Assistant">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </button>
            </div>
        </div>
      `;
      
      header.querySelectorAll('.view-btn').forEach(btn => {
          btn.style.cssText = "padding: 0.4rem; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; border-radius: 6px; display: flex;" + (btn.classList.contains('active') ? "background: rgba(255,255,255,0.1); color: var(--text-primary);" : "");
          btn.addEventListener('click', () => {
              state.currentView = btn.dataset.view;
              render();
          });
      });
      header.querySelector('.nav-back').addEventListener('click', () => window.navigateTo('home'));

      const openToolTab = (id, title) => {
          if (state.currentView === 'view1') state.currentView = 'view2';
          
          if (state.currentView === 'view3') {
              if (!state.sideTabs.find(t => t.id === id)) state.sideTabs.push({ id, title, type: 'system' });
              state.activeSideTabId = id;
          } else if (state.currentView === 'view4') {
              const mainPane = state.layoutRoot.children.find(c => c.id !== 'sidebar' && c.type === 'pane');
              if (mainPane) {
                  if (!mainPane.tabs.find(t => t.id === id)) mainPane.tabs.push({ id, title, type: 'system' });
                  mainPane.activeTabId = id;
              }
          } else if (state.currentView === 'view5') {
              const pane = state.view5RightPaneVisible ? state.view5Panes.right : state.view5Panes.main;
              if (!pane.topTabs.find(t => t.id === id)) pane.topTabs.push({ id, title, type: 'system' });
              pane.topActiveTabId = id;
          } else if (state.currentView === 'view6') {
              const pane = state.view6RightPaneVisible ? state.view6Panes.right : state.view6Panes.main;
              if (!pane.topTabs.find(t => t.id === id)) pane.topTabs.push({ id, title, type: 'system' });
              pane.topActiveTabId = id;
          } else {
              if (!state.openTabs.find(t => t.id === id)) state.openTabs.push({ id, title, type: 'system' });
              state.activeTabId = id;
          }
          render();
      };
      
      header.querySelector('#search-trigger').addEventListener('click', () => openToolTab('search', 'Search'));
      header.querySelector('#add-trigger').addEventListener('click', () => openToolTab('add', 'New Item'));
      header.querySelector('#ai-trigger').addEventListener('click', () => openToolTab('ai', 'AI Chat'));

      const controlsDiv = header.querySelector('#header-controls');
      
      if (state.currentView === 'view4') {
          const addPaneBtn = document.createElement('button');
          addPaneBtn.id = 'add-pane-btn';
          addPaneBtn.className = 'btn';
          addPaneBtn.style.cssText = 'padding: 0.4rem 0.8rem; font-size: 0.85rem; background: var(--bg-panel); border: 1px solid var(--border-subtle);';
          addPaneBtn.textContent = '+ Split';
          addPaneBtn.addEventListener('click', () => {
              state.layoutRoot.children.push({ id: `pane-${Date.now()}`, type: 'pane', flex: 1, tabs: [], activeTabId: null });
              render();
          });
          controlsDiv.appendChild(addPaneBtn);
      }
      
      if (state.currentView === 'view5') {
          const toggleBtn = document.createElement('button');
          toggleBtn.id = 'toggle-right-pane';
          toggleBtn.className = 'btn';
          toggleBtn.style.cssText = `padding: 0.4rem 0.8rem; font-size: 0.85rem; background: ${state.view5RightPaneVisible ? 'var(--primary)' : 'var(--bg-panel)'}; border: 1px solid var(--border-subtle);`;
          toggleBtn.textContent = state.view5RightPaneVisible ? '− Hide Right' : '+ Add Right';
          toggleBtn.addEventListener('click', () => {
              state.view5RightPaneVisible = !state.view5RightPaneVisible;
              render();
          });
          controlsDiv.appendChild(toggleBtn);
      }
      
      if (state.currentView === 'view6') {
          const toggleBtn = document.createElement('button');
          toggleBtn.id = 'toggle-right-pane-v6';
          toggleBtn.className = 'btn';
          toggleBtn.style.cssText = `padding: 0.4rem 0.8rem; font-size: 0.85rem; background: ${state.view6RightPaneVisible ? 'var(--primary)' : 'var(--bg-panel)'}; border: 1px solid var(--border-subtle);`;
          toggleBtn.textContent = state.view6RightPaneVisible ? '− Hide Right' : '+ Add Right';
          toggleBtn.addEventListener('click', () => {
              state.view6RightPaneVisible = !state.view6RightPaneVisible;
              render();
          });
          controlsDiv.appendChild(toggleBtn);
      }

      container.appendChild(header);

      let content;
      if (state.currentView === 'view1') content = renderView1(project, state, setupResizer);
      else if (state.currentView === 'view2') content = renderView2(project, state, setupResizer, renderTabPane);
      else if (state.currentView === 'view3') content = renderView3(project, state, setupResizer, renderTabPane);
      else if (state.currentView === 'view4') content = renderView4(project, state);
      else if (state.currentView === 'view5') content = renderView5(project, state, setupResizer, renderTabPane);
      else content = renderView6(project, state, setupResizer, renderTabPane);

      content.style.flex = '1';
      content.style.overflow = 'hidden';
      container.appendChild(content);
  };

  const renderView1 = (project, state, setupResizer) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'grid';
      wrapper.style.gridTemplateColumns = `${state.view1ColWidths[0]}px auto ${state.view1ColWidths[1]}px auto 1fr`;
      wrapper.style.height = '100%';

      const paneCollections = document.createElement('div');
      paneCollections.className = 'pane-scrollable glass-panel';
      paneCollections.style.padding = '0.5rem';
      
      const projectCollections = collections.filter(c => c.projectId === project.id);
      paneCollections.innerHTML = `
        <div class="list-item ${state.activeCollectionId === 'all' ? 'active' : ''}" data-id="all" style="padding: 0.6rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 0.25rem; ${state.activeCollectionId === 'all' ? 'background: rgba(99, 102, 241, 0.15); color: var(--primary);' : 'color: var(--text-secondary);'}">
           <span style="font-weight: 500;">Everything</span>
        </div>
        ${projectCollections.map(c => `
            <div class="list-item ${state.activeCollectionId === c.id ? 'active' : ''}" data-id="${c.id}" style="padding: 0.6rem 0.8rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; margin-bottom: 0.25rem; ${state.activeCollectionId === c.id ? 'background: rgba(99, 102, 241, 0.15); color: var(--primary);' : 'color: var(--text-secondary);'}">
               <span style="font-weight: 500;">${c.title}</span>
               <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">${c.itemCount}</span>
            </div>
        `).join('')}
      `;
      paneCollections.querySelectorAll('.list-item').forEach(el => {
         el.addEventListener('click', () => { 
             state.activeCollectionId = el.dataset.id === 'all' ? 'all' : parseInt(el.dataset.id); 
             state.activeItemId = null; 
             render(); 
         });
      });

      const resizer1 = document.createElement('div');
      resizer1.className = 'resizer-col';
      setupResizer(resizer1, wrapper, 0, 'view1ColWidths');

      const paneItems = document.createElement('div');
      paneItems.className = 'pane-scrollable glass-panel';
      paneItems.style.padding = '0.5rem';
      
      const displayItems = state.activeCollectionId === 'all' 
          ? items.filter(i => i.projectId === project.id) 
          : items.filter(i => i.collectionId === state.activeCollectionId);
          
      paneItems.innerHTML = displayItems.map(item => `
          <div class="item-card-mini ${state.activeItemId === item.id ? 'active' : ''}" data-id="${item.id}" style="padding: 0.8rem; border-radius: 8px; cursor: pointer; margin-bottom: 0.5rem; ${state.activeItemId === item.id ? 'background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-subtle);' : 'background: rgba(255, 255, 255, 0.02); border: 1px solid transparent;'}">
             <div style="font-weight: 500; font-size: 0.9rem;">${item.title}</div>
             <div style="font-size: 0.75rem; color: var(--text-muted); margin-top:0.25rem;">${item.date}</div>
          </div>
      `).join('') || '<div style="padding: 1rem; color: var(--text-muted);">No items in this collection</div>';
      
      paneItems.querySelectorAll('.item-card-mini').forEach(el => {
         el.addEventListener('click', () => { 
             state.activeItemId = parseInt(el.dataset.id); 
             render(); 
         });
      });

      const resizer2 = document.createElement('div');
      resizer2.className = 'resizer-col';
      setupResizer(resizer2, wrapper, 1, 'view1ColWidths');

      const paneDetail = document.createElement('div');
      paneDetail.className = 'pane-scrollable glass-panel';
      paneDetail.style.padding = '2rem';
      
      const activeItem = items.find(i => i.id === state.activeItemId);
      paneDetail.innerHTML = activeItem
         ? `<h2 style="margin-bottom: 1rem;">${activeItem.title}</h2>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">${activeItem.type} • ${activeItem.date}</div>
            <div style="line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap;">${
                activeItem.content || (activeItem.type === 'link' ? `<a href="${activeItem.url}" target="_blank" style="color:var(--primary);">${activeItem.url}</a>` : 'No preview available')
            }</div>`
         : `<div style="color: var(--text-muted); text-align: center; margin-top: 5rem;">Select an item to view details</div>`;

      wrapper.appendChild(paneCollections);
      wrapper.appendChild(resizer1);
      wrapper.appendChild(paneItems);
      wrapper.appendChild(resizer2);
      wrapper.appendChild(paneDetail);
      
      return wrapper; 
  };

  const renderView2 = (project, state, setupResizer, renderTabPane) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '1rem';
      wrapper.style.height = '100%';
      
      const top = document.createElement('div');
      top.style.height = '140px'; 
      top.style.display = 'grid'; top.style.gridTemplateColumns = '1fr 300px'; top.style.gap = '1rem';
      
      const colContainer = document.createElement('div');
      colContainer.className = 'glass-panel pane-scrollable';
      colContainer.style.display = 'flex';
      colContainer.style.gap = '1rem';
      colContainer.style.padding = '1rem';
      colContainer.style.alignItems = 'center';
      colContainer.innerHTML = `
          <div class="col-card ${state.activeCollectionId==='all'?'active':''}" data-id="all" style="min-width:140px;height:100px;border:1px solid var(--border-subtle);border-radius:12px;padding:1rem;">Everything</div>
          ${collections.filter(c=>c.projectId===project.id).map(c=>`<div class="col-card ${state.activeCollectionId===c.id?'active':''}" data-id="${c.id}" style="min-width:140px;height:100px;border:1px solid var(--border-subtle);border-radius:12px;padding:1rem;">${c.title}<br><small>${c.itemCount} items</small></div>`).join('')}
      `;
      colContainer.querySelectorAll('.col-card').forEach(el=>{
          if(el.classList.contains('active')) el.style.border = '1px solid var(--primary)';
          el.addEventListener('click', () => { state.activeCollectionId = el.dataset.id==='all'?'all':parseInt(el.dataset.id); render(); });
      });
      top.appendChild(colContainer);
      top.appendChild(document.createElement('div'));
      
      const bottom = document.createElement('div');
      bottom.style.display = 'grid';
      bottom.style.gridTemplateColumns = `${state.view2ColWidths[0]}px auto 1fr`;
      bottom.style.flex = '1';
      bottom.style.overflow = 'hidden';
      
      const list = document.createElement('div'); 
      list.className = 'pane-scrollable';
      list.style.padding = '0.5rem';
      
      const visibleItems = state.activeCollectionId === 'all' ? items.filter(i=>i.projectId===project.id) : items.filter(i=>i.collectionId===state.activeCollectionId);
      list.innerHTML = visibleItems.map(i => `
         <div class="item-card-v2" data-id="${i.id}" style="padding:1rem; margin-bottom:0.5rem; background:rgba(255,255,255,0.03); border-radius:8px; cursor:pointer;">
           <div style="font-weight:600;">${i.title}</div>
           <div style="font-size:0.8rem; color:var(--text-muted);">${i.date}</div>
         </div>
      `).join('');
      list.querySelectorAll('.item-card-v2').forEach(el=>el.addEventListener('click', () => {
          const item = items.find(k=>k.id==el.dataset.id);
          if(!state.openTabs.find(t=>t.id==item.id)) state.openTabs.push(item);
          state.activeTabId=item.id;
          render();
      }));

      const resizer = document.createElement('div'); 
      resizer.className = 'resizer-col'; 
      setupResizer(resizer, bottom, 0, 'view2ColWidths');
      const tabs = renderTabPane(state.openTabs, state.activeTabId, (id)=> { state.activeTabId = id; render(); }, (id) => { state.openTabs = state.openTabs.filter(t=>t.id!==id); render(); });
      
      bottom.appendChild(list); bottom.appendChild(resizer); bottom.appendChild(tabs);
      wrapper.appendChild(top); wrapper.appendChild(bottom);
      return wrapper;
  };

  const renderView3 = (project, state, setupResizer, renderTabPane) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '1rem';
      wrapper.style.height = '100%';
      
      const top = document.createElement('div');
      top.style.height = '60px'; 
      top.className = 'glass-panel';
      top.style.display = 'flex';
      top.style.alignItems = 'center';
      top.style.padding = '0 1rem';
      top.style.gap = '1rem';
      top.innerHTML = collections.filter(c=>c.projectId===project.id).map(c=>`<div class="pill" style="cursor:pointer; opacity:${state.activeCollectionId===c.id?1:0.5}">${c.title}</div>`).join('');
      top.querySelectorAll('.pill').forEach((el,i) => el.addEventListener('click', () => { state.activeCollectionId = collections.filter(c=>c.projectId===project.id)[i].id; render(); }));
      
      const bottom = document.createElement('div');
      bottom.style.display = 'grid';
      bottom.style.gridTemplateColumns = `${state.view3ColWidths[0]}px auto ${state.view3ColWidths[1]}px auto 1fr`;
      bottom.style.flex = '1';
      bottom.style.overflow = 'hidden';
      
      const list = document.createElement('div'); 
      list.className = 'pane-scrollable';
      const visibleItems = state.activeCollectionId === 'all' ? items.filter(i=>i.projectId===project.id) : items.filter(i=>i.collectionId===state.activeCollectionId);
      list.innerHTML = visibleItems.map(i => `<div class="item-row" data-id="${i.id}" style="padding:0.5rem; cursor:pointer;">${i.title}</div>`).join('');
      list.querySelectorAll('.item-row').forEach(el=>el.addEventListener('click', () => {
          const item = items.find(k=>k.id==el.dataset.id);
          if(!state.openTabs.find(t=>t.id==item.id)) state.openTabs.push(item);
          state.activeTabId=item.id;
          render();
      }));

      const r1 = document.createElement('div'); 
      r1.className = 'resizer-col'; 
      setupResizer(r1, bottom, 0, 'view3ColWidths');
      const mainTabs = renderTabPane(state.openTabs, state.activeTabId, (id)=>{state.activeTabId=id; render();}, (id)=>{state.openTabs=state.openTabs.filter(t=>t.id!==id); render();});
      const r2 = document.createElement('div'); 
      r2.className = 'resizer-col'; 
      setupResizer(r2, bottom, 1, 'view3ColWidths');
      const sideTabs = renderTabPane(state.sideTabs, state.activeSideTabId, (id)=>{state.activeSideTabId=id; render();}, (id)=>{state.sideTabs=state.sideTabs.filter(t=>t.id!==id); render();});

      bottom.appendChild(list); bottom.appendChild(r1); bottom.appendChild(mainTabs); bottom.appendChild(r2); bottom.appendChild(sideTabs);
      wrapper.appendChild(top); wrapper.appendChild(bottom);
      return wrapper;
  };

  const renderView4 = (project, state) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.height = '100%';
      wrapper.style.gap = '4px';

      const sidebar = document.createElement('div');
      sidebar.className = 'glass-panel pane-scrollable';
      sidebar.style.width = '280px';
      sidebar.style.flexShrink = '0';
      sidebar.style.display = 'flex';
      sidebar.style.flexDirection = 'column';
      
      const collectionBar = document.createElement('div');
      collectionBar.style.padding = '0.5rem';
      collectionBar.style.display = 'flex';
      collectionBar.style.gap = '0.5rem';
      collectionBar.style.flexWrap = 'wrap';
      collectionBar.style.borderBottom = '1px solid var(--border-subtle)';
      collectionBar.innerHTML = `
          <div class="pill ${state.activeCollectionId==='all'?'active':''}" data-id="all" style="padding:0.3rem 0.6rem; border-radius:12px; font-size:0.75rem; cursor:pointer; ${state.activeCollectionId==='all'?'background:var(--primary);':'background:rgba(255,255,255,0.05);'}">All</div>
          ${collections.filter(c=>c.projectId===project.id).map(c=>`
              <div class="pill ${state.activeCollectionId===c.id?'active':''}" data-id="${c.id}" style="padding:0.3rem 0.6rem; border-radius:12px; font-size:0.75rem; cursor:pointer; ${state.activeCollectionId===c.id?'background:var(--primary);':'background:rgba(255,255,255,0.05);'}">${c.title}</div>
          `).join('')}
      `;
      collectionBar.querySelectorAll('.pill').forEach(el => {
          el.addEventListener('click', () => {
              state.activeCollectionId = el.dataset.id === 'all' ? 'all' : parseInt(el.dataset.id);
              render();
          });
      });
      sidebar.appendChild(collectionBar);
      
      const itemsList = document.createElement('div');
      itemsList.style.flex = '1';
      itemsList.style.overflow = 'auto';
      itemsList.style.padding = '0.5rem';
      
      const displayItems = state.activeCollectionId === 'all' 
          ? items.filter(i => i.projectId === project.id) 
          : items.filter(i => i.collectionId === state.activeCollectionId);
          
      itemsList.innerHTML = displayItems.map(item => `
          <div class="item-row" data-id="${item.id}" style="padding:0.6rem; margin-bottom:0.25rem; border-radius:6px; cursor:pointer; background:${state.activeItemId===item.id?'rgba(99,102,241,0.15)':'transparent'};">
              <div style="font-weight:500; font-size:0.85rem;">${item.title}</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">${item.type}</div>
          </div>
      `).join('') || '<div style="padding:1rem; color:var(--text-muted);">No items</div>';
      
      itemsList.querySelectorAll('.item-row').forEach(el => {
          el.addEventListener('click', () => {
              state.activeItemId = parseInt(el.dataset.id);
              const mainPane = state.layoutRoot.children.find(c => c.id !== 'sidebar') || state.layoutRoot.children[1];
              if (mainPane && mainPane.type === 'pane') {
                  const item = items.find(i => i.id === state.activeItemId);
                  if (!mainPane.tabs.find(t => t.id === item.id)) {
                      mainPane.tabs.push(item);
                      mainPane.activeTabId = item.id;
                  }
                  render();
              }
          });
      });
      sidebar.appendChild(itemsList);
      wrapper.appendChild(sidebar);

      const renderPane = (node) => {
          const el = document.createElement('div');
          el.className = 'glass-panel';
          el.style.flex = node.flex || '1';
          el.style.display = 'flex';
          el.style.flexDirection = 'column';
          el.style.overflow = 'hidden';
          
          const header = document.createElement('div');
          header.style.display = 'flex';
          header.style.background = 'rgba(0,0,0,0.2)';
          header.style.height = '36px';
          header.style.alignItems = 'center';
          header.style.padding = '0 0.5rem';
          header.style.borderBottom = '1px solid var(--border-subtle)';
          
          if (node.tabs.length === 0) {
              header.innerHTML = `<span style="color:var(--text-muted); font-size:0.8rem;">Empty - Click item to open</span>`;
          } else {
              node.tabs.forEach(tab => {
                  const isActive = node.activeTabId === tab.id;
                  const tabEl = document.createElement('div');
                  tabEl.style.cssText = `padding:0 0.8rem; height:100%; display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; cursor:pointer; border-right:1px solid var(--border-subtle); background:${isActive?'var(--bg-glass)':'transparent'}; color:${isActive?'white':'var(--text-muted)'}; max-width:140px;`;
                  tabEl.innerHTML = `<span style="white-space:nowrap; overflow:hidden; overflow:hidden; text-overflow:ellipsis;">${tab.title}</span><span class="close-btn" style="opacity:0.5;">×</span>`;
                  tabEl.addEventListener('click', (e) => {
                      if (e.target.classList.contains('close-btn')) {
                          node.tabs = node.tabs.filter(t => t.id !== tab.id);
                          if (node.activeTabId === tab.id) node.activeTabId = node.tabs.length ? node.tabs[node.tabs.length-1].id : null;
                          render();
                      } else {
                          node.activeTabId = tab.id;
                          render();
                      }
                  });
                  header.appendChild(tabEl);
              });
          }
          el.appendChild(header);
          
          const content = document.createElement('div');
          content.className = 'pane-scrollable';
          content.style.flex = '1';
          content.style.padding = '0';
          
          const activeTab = node.tabs.find(t => t.id === node.activeTabId);
          if (activeTab) {
              if (activeTab.id === 'search') {
                  content.appendChild(renderSearchTab());
              } else if (activeTab.id === 'add') {
                  content.appendChild(renderAddTab());
              } else if (activeTab.id === 'ai') {
                  content.appendChild(renderAITab());
              } else if (activeTab.type === 'system-welcome') {
                  content.style.padding = '1.5rem';
                  content.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:3rem;"><h3>Welcome</h3><p>Select an item from the sidebar</p></div>`;
              } else {
                  content.style.padding = '1.5rem';
                  content.innerHTML = `
                      <h2 style="margin-bottom:0.5rem;">${activeTab.title}</h2>
                      <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1.5rem;">${activeTab.type || 'note'} • ${activeTab.date || ''}</div>
                      <div style="line-height:1.6; white-space:pre-wrap;">${activeTab.content || (activeTab.type==='link'?`<a href="${activeTab.url}" target="_blank" style="color:var(--primary);">${activeTab.url}</a>`:'No content')}</div>
                  `;
              }
          } else {
              content.style.padding = '1.5rem';
              content.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:3rem;">No tab selected</div>`;
          }
          el.appendChild(content);
          
          return el;
      };

      state.layoutRoot.children.filter(c => c.id !== 'sidebar').forEach(pane => {
          if (pane.type === 'pane') {
              wrapper.appendChild(renderPane(pane));
          }
      });

      return wrapper;
  };

  const renderView5 = (project, state, setupResizer, renderTabPane) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.height = '100%';
      wrapper.style.gap = '0.5rem';

      const colBar = document.createElement('div');
      colBar.className = 'glass-panel';
      colBar.style.cssText = 'padding: 0.75rem 1rem; display: flex; gap: 0.75rem; align-items: center; overflow-x: auto; flex-shrink: 0;';
      
      const projectCols = collections.filter(c => c.projectId === project.id);
      colBar.innerHTML = `
          <div class="col-pill ${state.activeCollectionId === 'all' ? 'active' : ''}" data-id="all" 
               style="padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; white-space: nowrap; font-size: 0.85rem; font-weight: 500;
               ${state.activeCollectionId === 'all' ? 'background: var(--primary); color: white;' : 'background: rgba(255,255,255,0.05); color: var(--text-secondary);'}">
              All Items
          </div>
          ${projectCols.map(c => `
              <div class="col-pill ${state.activeCollectionId === c.id ? 'active' : ''}" data-id="${c.id}"
                   style="padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; white-space: nowrap; font-size: 0.85rem; font-weight: 500;
                   ${state.activeCollectionId === c.id ? 'background: var(--primary); color: white;' : 'background: rgba(255,255,255,0.05); color: var(--text-secondary);'}">
                  ${c.title} <span style="opacity: 0.6; margin-left: 0.25rem; font-size: 0.7rem;">${c.itemCount}</span>
              </div>
          `).join('')}
      `;
      colBar.querySelectorAll('.col-pill').forEach(el => {
          el.onclick = () => { state.activeCollectionId = el.dataset.id === 'all' ? 'all' : parseInt(el.dataset.id); render(); };
      });
      wrapper.appendChild(colBar);

      const mainRow = document.createElement('div');
      mainRow.style.cssText = 'flex: 1; display: grid; overflow: hidden;';
      mainRow.style.gridTemplateColumns = state.view5RightPaneVisible 
          ? `${state.view5ColWidths[0]}px auto ${state.view5ColWidths[1]}px auto 1fr` 
          : `${state.view5ColWidths[0]}px auto 1fr`;

      const list = document.createElement('div');
      list.className = 'glass-panel pane-scrollable';
      list.style.padding = '0.5rem';
      const visible = state.activeCollectionId === 'all' ? items.filter(i => i.projectId === project.id) : items.filter(i => i.collectionId === state.activeCollectionId);
      list.innerHTML = visible.map(i => `
          <div class="item-row-v5 ${state.activeItemId === i.id ? 'active' : ''}" data-id="${i.id}" 
               style="padding: 0.75rem; border-radius: 8px; cursor: pointer; margin-bottom: 0.25rem;
               ${state.activeItemId === i.id ? 'background: rgba(99,102,241,0.15); border-left: 3px solid var(--primary);' : 'background: transparent;'}">
              <div style="font-weight:500; font-size:0.9rem;">${i.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${i.type}</div>
          </div>
      `).join('') || '<div style="padding:1rem; color:var(--text-muted);">No items</div>';
      list.querySelectorAll('.item-row-v5').forEach(el => {
          el.onclick = () => {
              const item = items.find(k => k.id === parseInt(el.dataset.id));
              state.activeItemId = item.id;
              const main = state.view5Panes.main;
              if (!main.topTabs.find(t => t.id === item.id)) main.topTabs.push(item);
              main.topActiveTabId = item.id;
              render();
          };
      });
      mainRow.appendChild(list);

      const res1 = document.createElement('div');
      res1.className = 'resizer-col';
      setupResizer(res1, mainRow, 0, 'view5ColWidths');
      mainRow.appendChild(res1);
      mainRow.appendChild(renderSplittablePane('main', 'view5Panes', state, setupResizer, renderTabPane, 'view5'));

      if (state.view5RightPaneVisible) {
          const res2 = document.createElement('div'); 
          res2.className = 'resizer-col';
          setupResizer(res2, mainRow, 1, 'view5ColWidths');
          mainRow.appendChild(res2);
          mainRow.appendChild(renderSplittablePane('right', 'view5Panes', state, setupResizer, renderTabPane, 'view5'));
      }

      wrapper.appendChild(mainRow);
      return wrapper;
  };

  const renderSplittablePane = (paneKey, stateKey, state, setupResizer, renderTabPane, viewName) => {
      const config = state[stateKey][paneKey];
      const paneWrapper = document.createElement('div');
      paneWrapper.style.display = 'flex';
      paneWrapper.style.flexDirection = 'column';
      paneWrapper.style.height = '100%';
      paneWrapper.style.overflow = 'hidden';

      if (config.isSplit) {
          const topWrapper = document.createElement('div');
          topWrapper.style.flex = `${config.splitRatio} 1 0px`;
          topWrapper.style.overflow = 'hidden';
          topWrapper.style.display = 'flex';
          topWrapper.style.flexDirection = 'column';
          topWrapper.style.minHeight = '0';
          
          const activePane = stateKey === 'view5Panes' ? state.view5ActivePane : state.view6ActivePane;
          const isActiveTop = activePane === `${paneKey}-top`;
          if (isActiveTop) topWrapper.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
          
          const topPane = renderTabPane(
              config.topTabs,
              config.topActiveTabId,
              (id) => { config.topActiveTabId = id; render(); },
              (id) => { config.topTabs = config.topTabs.filter(t => t.id !== id); if (config.topActiveTabId === id) config.topActiveTabId = config.topTabs.length ? config.topTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          topPane.style.flex = '1';
          topPane.style.height = '100%';
          topWrapper.appendChild(topPane);

          const topHeader = topPane.querySelector('div');
          if (topHeader) {
              const unsplitBtn = document.createElement('button');
              unsplitBtn.innerHTML = '⊟';
              unsplitBtn.title = 'Remove Split';
              unsplitBtn.style.cssText = 'margin-left: auto; padding: 0.25rem 0.5rem; background: transparent; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;';
              unsplitBtn.onclick = (e) => {
                  e.stopPropagation();
                  config.topTabs = [...config.topTabs, ...config.bottomTabs];
                  config.bottomTabs = [];
                  config.isSplit = false;
                  render();
              };
              topHeader.appendChild(unsplitBtn);
          }

          const resizer = document.createElement('div');
          resizer.className = 'resizer-row';
          resizer.addEventListener('mousedown', (e) => {
              e.preventDefault();
              resizer.classList.add('resizing');
              const startY = e.clientY;
              const startRatio = config.splitRatio;
              const paneHeight = paneWrapper.offsetHeight;
              const onMove = (mv) => {
                  const dy = mv.clientY - startY;
                  config.splitRatio = Math.max(10, Math.min(90, startRatio + (dy / paneHeight) * 100));
                  render();
              };
              const onUp = () => {
                  resizer.classList.remove('resizing');
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
          });

          const bottomWrapper = document.createElement('div');
          bottomWrapper.style.flex = `${100 - config.splitRatio} 1 0px`;
          bottomWrapper.style.overflow = 'hidden';
          bottomWrapper.style.display = 'flex';
          bottomWrapper.style.flexDirection = 'column';
          bottomWrapper.style.minHeight = '0';

          const isActiveBottom = activePane === `${paneKey}-bottom`;
          if (isActiveBottom) bottomWrapper.style.boxShadow = 'inset 0 0 0 2px var(--primary)';

          const bottomPane = renderTabPane(
              config.bottomTabs,
              config.bottomActiveTabId,
              (id) => { config.bottomActiveTabId = id; render(); },
              (id) => { config.bottomTabs = config.bottomTabs.filter(t => t.id !== id); if (config.bottomActiveTabId === id) config.bottomActiveTabId = config.bottomTabs.length ? config.bottomTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          bottomPane.style.flex = '1';
          bottomPane.style.height = '100%';
          bottomWrapper.appendChild(bottomPane);

          paneWrapper.appendChild(topWrapper);
          paneWrapper.appendChild(resizer);
          paneWrapper.appendChild(bottomWrapper);
      } else {
          const singlePane = renderTabPane(
              config.topTabs,
              config.topActiveTabId,
              (id) => { config.topActiveTabId = id; render(); },
              (id) => { config.topTabs = config.topTabs.filter(t => t.id !== id); if (config.topActiveTabId === id) config.topActiveTabId = config.topTabs.length ? config.topTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          
          const activePane = stateKey === 'view5Panes' ? state.view5ActivePane : state.view6ActivePane;
          const isActive = activePane === `${paneKey}-top`;
          if (isActive) singlePane.style.boxShadow = 'inset 0 0 0 2px var(--primary)';

          const header = singlePane.querySelector('div');
          if (header) {
              const splitBtn = document.createElement('button');
              splitBtn.innerHTML = '⊞';
              splitBtn.title = 'Split Vertically';
              splitBtn.style.cssText = 'margin-left: auto; padding: 0.25rem 0.5rem; background: transparent; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;';
              splitBtn.onclick = (e) => {
                  e.stopPropagation();
                  config.isSplit = true;
                  render();
              };
              header.appendChild(splitBtn);
          }
          paneWrapper.appendChild(singlePane);
      }
      
      return paneWrapper;
  };

  const renderView6 = (project, state, setupResizer, renderTabPane) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.height = '100%';
      wrapper.style.gap = '0.5rem';

      const showToast = (message, type = 'info') => {
          const toast = document.createElement('div');
          const colors = { info: 'var(--primary)', success: '#22c55e', error: '#ef4444' };
          toast.style.cssText = `position: fixed; bottom: 2rem; right: 2rem; padding: 0.75rem 1.5rem; background: ${colors[type]}; color: white; border-radius: 8px; font-size: 0.9rem; z-index: 1000; animation: slideIn 0.3s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;
          toast.textContent = message;
          document.body.appendChild(toast);
          setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease-out'; setTimeout(() => toast.remove(), 300); }, 3000);
      };

      const topBar = document.createElement('div');
      topBar.className = 'glass-panel';
      topBar.style.cssText = 'padding: 0.5rem 1rem; display: flex; gap: 1rem; align-items: center; flex-shrink: 0; flex-wrap: wrap;';
      
      const projectCols = collections.filter(c => c.projectId === project.id);
      topBar.innerHTML = `
          <div style="display: flex; gap: 0.5rem; align-items: center;">
              <div class="col-pill ${state.activeCollectionId === 'all' ? 'active' : ''}" data-id="all" 
                   style="padding: 0.4rem 0.8rem; border-radius: 16px; cursor: pointer; white-space: nowrap; font-size: 0.8rem; font-weight: 500; ${state.activeCollectionId === 'all' ? 'background: var(--primary); color: white;' : 'background: rgba(255,255,255,0.05); color: var(--text-secondary);'}">
                  All (${items.filter(i=>i.projectId===project.id).length})
              </div>
              ${projectCols.map(c => `
                  <div class="col-pill ${state.activeCollectionId === c.id ? 'active' : ''}" data-id="${c.id}"
                       style="padding: 0.4rem 0.8rem; border-radius: 16px; cursor: pointer; white-space: nowrap; font-size: 0.8rem; font-weight: 500; ${state.activeCollectionId === c.id ? 'background: var(--primary); color: white;' : 'background: rgba(255,255,255,0.05); color: var(--text-secondary);'}">
                      ${c.title} <span style="opacity: 0.6; margin-left: 0.25rem; font-size: 0.7rem;">${c.itemCount}</span>
                  </div>
              `).join('')}
          </div>
          <div style="flex: 1; min-width: 200px; max-width: 400px; position: relative;">
              <input type="text" id="v6-search" placeholder="⌘K to search..." value="${state.view6SearchQuery}"
                  style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); padding: 0.5rem 0.8rem 0.5rem 2rem; border-radius: 6px; color: white; font-size: 0.85rem; outline: none;">
              <svg style="position: absolute; left: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
              ${state.view6SearchQuery ? `<span style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); cursor: pointer; font-size: 0.7rem;" id="clear-search">✕</span>` : ''}
          </div>
      `;
      wrapper.appendChild(topBar);

      topBar.querySelectorAll('.col-pill').forEach(el => {
          el.onclick = () => { state.activeCollectionId = el.dataset.id === 'all' ? 'all' : parseInt(el.dataset.id); state.view6SearchQuery = ''; render(); };
      });

      const searchInput = topBar.querySelector('#v6-search');
      searchInput.addEventListener('input', (e) => { state.view6SearchQuery = e.target.value; render(); });
      
      const clearBtn = topBar.querySelector('#clear-search');
      if (clearBtn) { clearBtn.onclick = () => { state.view6SearchQuery = ''; render(); }; }

      const quickBar = document.createElement('div');
      quickBar.style.cssText = 'padding: 0 0.5rem 0.5rem; display: flex; gap: 0.5rem; align-items: center;';
      quickBar.innerHTML = `<span style="color: var(--text-muted); font-size: 0.75rem;">Quick:</span>`;
      
      const quickBtns = [
          { id: 'pinned', label: '📌 Pinned' },
          { id: 'recent', label: '🕐 Recent' },
          { id: 'favorites', label: '⭐ Favorites' },
          { id: 'trash', label: '🗑️ Trash' }
      ];
      quickBtns.forEach(btn => {
          const b = document.createElement('button');
          b.className = 'btn';
          b.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); padding: 0.3rem 0.8rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem;';
          b.innerHTML = btn.label;
          b.onclick = () => {
              const pane = state.view6RightPaneVisible ? state.view6Panes.right : state.view6Panes.main;
              if (!pane.topTabs.find(t => t.id === `quick-${btn.id}`)) pane.topTabs.push({ id: `quick-${btn.id}`, title: btn.label, type: 'system-quick', content: `# ${btn.label}\n\nThis is a ${btn.label} view placeholder.` });
              pane.topActiveTabId = `quick-${btn.id}`;
              render();
          };
          quickBar.appendChild(b);
      });
      wrapper.appendChild(quickBar);

      const mainRow = document.createElement('div');
      mainRow.style.cssText = 'flex: 1; display: grid; overflow: hidden; position: relative;';
      mainRow.style.gridTemplateColumns = state.view6RightPaneVisible 
          ? `${state.view6ColWidths[0]}px auto ${state.view6ColWidths[1]}px auto 1fr` 
          : `${state.view6ColWidths[0]}px auto 1fr`;

      const list = document.createElement('div');
      list.className = 'glass-panel pane-scrollable';
      list.style.padding = '0';
      
      let visibleItems = state.activeCollectionId === 'all' 
          ? items.filter(i => i.projectId === project.id)
          : items.filter(i => i.collectionId === state.activeCollectionId);
      
      if (state.view6SearchQuery) {
          const q = state.view6SearchQuery.toLowerCase();
          visibleItems = visibleItems.filter(i => i.title.toLowerCase().includes(q) || (i.content && i.content.toLowerCase().includes(q)));
      }
      
      list.innerHTML = `
          <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; color: var(--text-muted);">${visibleItems.length} items</span>
              <button id="create-item-v6" class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: var(--primary);">+ New</button>
          </div>
          <div id="items-list-v6" style="padding: 0.25rem;"></div>
      `;
      
      const itemsListContainer = list.querySelector('#items-list-v6');
      itemsListContainer.innerHTML = visibleItems.map(i => {
          const isActive = state.activeItemId === i.id;
          const typeIcon = { note: '📝', link: '🔗', pdf: '📄', video: '🎥' }[i.type] || '📄';
          return `
              <div class="item-row-v6 ${isActive ? 'active' : ''}" data-id="${i.id}" 
                   style="padding: 0.6rem 0.75rem; border-radius: 6px; cursor: pointer; margin-bottom: 0.125rem; display: flex; align-items: center; gap: 0.5rem; ${isActive ? 'background: rgba(99,102,241,0.15); border-left: 3px solid var(--primary);' : 'background: transparent; border-left: 3px solid transparent;'}">
                  <span style="font-size: 0.9rem;">${typeIcon}</span>
                  <div style="flex: 1; min-width: 0;">
                      <div style="font-weight:500; font-size:0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${i.title}</div>
                      <div style="font-size:0.7rem; color:var(--text-muted);">${i.date}</div>
                  </div>
                  <button class="item-menu" style="opacity: 0; padding: 0.25rem; background: transparent; border: none; color: var(--text-muted); cursor: pointer;">⋮</button>
              </div>
          `;
      }).join('') || '<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No items found</div>';
      
      itemsListContainer.querySelectorAll('.item-row-v6').forEach(el => {
          el.addEventListener('mouseenter', () => { el.querySelector('.item-menu').style.opacity = '1'; });
          el.addEventListener('mouseleave', () => { el.querySelector('.item-menu').style.opacity = '0'; });
          
          el.addEventListener('click', (e) => {
              if (e.target.classList.contains('item-menu')) return;
              const item = items.find(k => k.id === parseInt(el.dataset.id));
              state.activeItemId = item.id;
              const main = state.view6Panes.main;
              if (!main.topTabs.find(t => t.id === item.id)) main.topTabs.push(item);
              main.topActiveTabId = item.id;
              render();
          });
          
          el.querySelector('.item-menu').addEventListener('click', (e) => {
              e.stopPropagation();
              const item = items.find(k => k.id === parseInt(el.dataset.id));
              showToast(`Context menu for: ${item.title}`, 'info');
          });
      });
      
      list.querySelector('#create-item-v6').addEventListener('click', () => {
          const title = prompt("Enter note title:");
          if (title) {
              const newItem = { id: Date.now(), projectId: project.id, title, type: 'note', content: `# ${title}\n\nCreated just now.`, date: 'Just now' };
              items.unshift(newItem);
              state.activeItemId = newItem.id;
              const main = state.view6Panes.main;
              if (!main.topTabs.find(t => t.id === newItem.id)) main.topTabs.push(newItem);
              main.topActiveTabId = newItem.id;
              showToast('Note created successfully', 'success');
              render();
          }
      });
      
      mainRow.appendChild(list);

      const res1 = document.createElement('div');
      res1.className = 'resizer-col';
      setupResizer(res1, mainRow, 0, 'view6ColWidths');
      mainRow.appendChild(res1);

      mainRow.appendChild(renderSplittablePane('main', 'view6Panes', state, setupResizer, renderTabPane, 'view6'));

      if (state.view6RightPaneVisible) {
          const res2 = document.createElement('div'); 
          res2.className = 'resizer-col';
          setupResizer(res2, mainRow, 1, 'view6ColWidths');
          mainRow.appendChild(res2);
          mainRow.appendChild(renderSplittablePane('right', 'view6Panes', state, setupResizer, renderTabPane, 'view6'));
      }

      wrapper.appendChild(mainRow);
      return wrapper;
  };

  const renderView6SplittablePane = (paneKey, stateKey, state, setupResizer, renderTabPane, viewName) => {
      const config = state[stateKey][paneKey];
      const paneWrapper = document.createElement('div');
      paneWrapper.style.display = 'flex';
      paneWrapper.style.flexDirection = 'column';
      paneWrapper.style.height = '100%';
      paneWrapper.style.overflow = 'hidden';

      if (config.isSplit) {
          const topWrapper = document.createElement('div');
          topWrapper.style.flex = `${config.splitRatio} 1 0px`;
          topWrapper.style.overflow = 'hidden';
          topWrapper.style.display = 'flex';
          topWrapper.style.flexDirection = 'column';
          topWrapper.style.minHeight = '0';
          
          const activePane = stateKey === 'view6Panes' ? state.view6ActivePane : state.view6ActivePane;
          const isActiveTop = activePane === `${paneKey}-top`;
          if (isActiveTop) topWrapper.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
          
          const topPane = renderTabPane(
              config.topTabs,
              config.topActiveTabId,
              (id) => { config.topActiveTabId = id; render(); },
              (id) => { config.topTabs = config.topTabs.filter(t => t.id !== id); if (config.topActiveTabId === id) config.topActiveTabId = config.topTabs.length ? config.topTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          topPane.style.flex = '1';
          topPane.style.height = '100%';
          topWrapper.appendChild(topPane);

          const topHeader = topPane.querySelector('div');
          if (topHeader) {
              const unsplitBtn = document.createElement('button');
              unsplitBtn.innerHTML = '⊟';
              unsplitBtn.title = 'Remove Split';
              unsplitBtn.style.cssText = 'margin-left: auto; padding: 0.25rem 0.5rem; background: transparent; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;';
              unsplitBtn.onclick = (e) => {
                  e.stopPropagation();
                  config.topTabs = [...config.topTabs, ...config.bottomTabs];
                  config.bottomTabs = [];
                  config.isSplit = false;
                  render();
              };
              topHeader.appendChild(unsplitBtn);
          }

          const resizer = document.createElement('div');
          resizer.className = 'resizer-row';
          resizer.addEventListener('mousedown', (e) => {
              e.preventDefault();
              resizer.classList.add('resizing');
              const startY = e.clientY;
              const startRatio = config.splitRatio;
              const paneHeight = paneWrapper.offsetHeight;
              const onMove = (mv) => {
                  const dy = mv.clientY - startY;
                  config.splitRatio = Math.max(10, Math.min(90, startRatio + (dy / paneHeight) * 100));
                  render();
              };
              const onUp = () => {
                  resizer.classList.remove('resizing');
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
          });

          const bottomWrapper = document.createElement('div');
          bottomWrapper.style.flex = `${100 - config.splitRatio} 1 0px`;
          bottomWrapper.style.overflow = 'hidden';
          bottomWrapper.style.display = 'flex';
          bottomWrapper.style.flexDirection = 'column';
          bottomWrapper.style.minHeight = '0';

          const isActiveBottom = activePane === `${paneKey}-bottom`;
          if (isActiveBottom) bottomWrapper.style.boxShadow = 'inset 0 0 0 2px var(--primary)';

          const bottomPane = renderTabPane(
              config.bottomTabs,
              config.bottomActiveTabId,
              (id) => { config.bottomActiveTabId = id; render(); },
              (id) => { config.bottomTabs = config.bottomTabs.filter(t => t.id !== id); if (config.bottomActiveTabId === id) config.bottomActiveTabId = config.bottomTabs.length ? config.bottomTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          bottomPane.style.flex = '1';
          bottomPane.style.height = '100%';
          bottomWrapper.appendChild(bottomPane);

          paneWrapper.appendChild(topWrapper);
          paneWrapper.appendChild(resizer);
          paneWrapper.appendChild(bottomWrapper);
      } else {
          const singlePane = renderTabPane(
              config.topTabs,
              config.topActiveTabId,
              (id) => { config.topActiveTabId = id; render(); },
              (id) => { config.topTabs = config.topTabs.filter(t => t.id !== id); if (config.topActiveTabId === id) config.topActiveTabId = config.topTabs.length ? config.topTabs[0].id : null; render(); },
              null, null, paneKey, stateKey
          );
          
          const activePane = stateKey === 'view6Panes' ? state.view6ActivePane : state.view6ActivePane;
          const isActive = activePane === `${paneKey}-top`;
          if (isActive) singlePane.style.boxShadow = 'inset 0 0 0 2px var(--primary)';

          const header = singlePane.querySelector('div');
          if (header) {
              const splitBtn = document.createElement('button');
              splitBtn.innerHTML = '⊞';
              splitBtn.title = 'Split Vertically';
              splitBtn.style.cssText = 'margin-left: auto; padding: 0.25rem 0.5rem; background: transparent; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;';
              splitBtn.onclick = (e) => {
                  e.stopPropagation();
                  config.isSplit = true;
                  render();
              };
              header.appendChild(splitBtn);
          }
          paneWrapper.appendChild(singlePane);
      }
      
      return paneWrapper;
  };

  window.dashboardState = state;
  
  const style = document.createElement('style');
  style.textContent = `
      @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
      }
      .draggable-tab {
          cursor: grab;
      }
      .draggable-tab:active {
          cursor: grabbing;
      }
  `;
  document.head.appendChild(style);

  render();
  return container;
}

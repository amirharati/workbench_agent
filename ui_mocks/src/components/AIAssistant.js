
export function createAIAssistant() {
  const container = document.createElement('div');
  container.className = 'ai-assistant animate-fade-in';
  container.style.height = 'calc(100vh - 4rem)';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  container.innerHTML = `
    <header style="margin-bottom: 2rem;">
      <h1 style="font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; background: linear-gradient(to right, var(--accent-purple), var(--accent-pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">AI Assistant</h1>
      <p style="color: var(--text-secondary);">Ask me anything about your projects, notes, or C++.</p>
    </header>

    <div class="glass-panel" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <!-- Chat Area -->
      <div style="flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem;">
        
        <!-- Assistant Message -->
        <div style="display: flex; gap: 1rem;">
           <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-purple), var(--primary)); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" color="white"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
           </div>
           <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0 12px 12px 12px; max-width: 80%;">
             <p style="font-size: 0.95rem; line-height: 1.5;">Hello! I've analyzed your <strong>Learning C++</strong> project. It looks like you're diving into memory management.</p>
             <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
                <button class="btn" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; background: rgba(99, 102, 241, 0.2); color: var(--primary-hover);">Quiz me on Smart Pointers</button>
                <button class="btn" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; background: rgba(99, 102, 241, 0.2); color: var(--primary-hover);">Summarize recent notes</button>
             </div>
           </div>
        </div>

        <!-- User Message (Mock) -->
        <div style="display: flex; gap: 1rem; flex-direction: row-reverse;">
           <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-panel); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
             <span style="font-size: 0.8rem; font-weight: 600;">ME</span>
           </div>
           <div style="background: var(--primary); padding: 1rem; border-radius: 12px 0 12px 12px; max-width: 80%;">
             <p style="font-size: 0.95rem; line-height: 1.5;">What is the difference between std::memory_order_acquire and release?</p>
           </div>
        </div>
        
         <!-- Assistant Message 2 -->
        <div style="display: flex; gap: 1rem;">
           <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-purple), var(--primary)); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" color="white"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
           </div>
           <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0 12px 12px 12px; max-width: 80%;">
             <p style="font-size: 0.95rem; line-height: 1.5;">Great question. These are used for <strong>synchronization</strong> between threads without using locks.</p>
             <ul style="margin-top: 0.5rem; margin-left: 1rem; list-style-type: disc; font-size: 0.9rem; color: var(--text-secondary);">
                <li><strong>Acquire</strong>: Ensures no reads/writes in the current thread can be reordered <em>before</em> this operation.</li>
                <li><strong>Release</strong>: Ensures no reads/writes in the current thread can be reordered <em>after</em> this operation.</li>
             </ul>
           </div>
        </div>

      </div>

      <!-- Input Area -->
      <div style="padding: 1rem; border-top: 1px solid var(--border-subtle); display: flex; gap: 1rem;">
        <input type="text" placeholder="Type a message..." style="flex: 1; background: var(--bg-app); border: 1px solid var(--border-subtle); padding: 0.8rem; border-radius: var(--radius-sm); color: white;">
        <button class="btn icon-only">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
  `;
  
  return container;
}

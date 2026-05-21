import { useState } from 'react';
import ReactDOM from 'react-dom/client';

// Minimal test render — no imports, no CSS, no dependencies
const TestApp = () => {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui' }}>
      <h3>Sidebar Test {count}</h3>
      <button onClick={() => setCount(c => c + 1)}>Click</button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<TestApp />);

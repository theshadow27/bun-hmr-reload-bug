// Client entrypoint - imports from workspace-linked shared package
import React from "react";
import { createRoot } from "react-dom/client";
import { APP_NAME, VERSION, formatMessage } from "@repro/shared";

console.log(formatMessage("Client loaded"));

function App() {
  const [count, setCount] = React.useState(0);
  const [serverTime, setServerTime] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch("/api/info")
      .then((r) => r.json())
      .then((data) => setServerTime(data.time));
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>{APP_NAME}</h1>
      <p>Version: {VERSION}</p>
      <p>Server time: {serverTime ? new Date(serverTime).toISOString() : "loading..."}</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
      <hr />
      <p style={{ color: "#666" }}>
        <strong>To reproduce bug:</strong><br />
        1. Run with: <code>bun run dev</code> (uses --watch)<br />
        2. Open this page<br />
        3. Refresh once - works<br />
        4. Refresh again - EISDIR errors in terminal
      </p>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

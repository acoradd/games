import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// StrictMode is intentionally removed — it double-invokes effects, which
// calls room.leave() on the first cleanup and auto-disposes the Colyseus room
// before the second mount can reconnect.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/base.css";
import "./styles.css";
import App from "./ui/App.jsx";

createRoot(document.getElementById("root")).render(<App />);

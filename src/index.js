import React from "react";
import ReactDOM from "react-dom/client";
// greenmist: the base theme the web accounting is built on (its themes/metadata.base.json).
import "devextreme/dist/css/dx.greenmist.css";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

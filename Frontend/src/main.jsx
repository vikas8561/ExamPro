import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import "./App.css";
import { startServerClock } from "./utils/serverClock";
import { API_BASE_URL } from "./config/api";

// Sync to the server's clock before anything decides what time it is.
startServerClock(`${API_BASE_URL}/time`);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

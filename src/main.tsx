import React from "react";
import ReactDOM from "react-dom/client";
import { RenderWindow } from "#/components/RenderWindow";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <React.StrictMode>
    <RenderWindow />
  </React.StrictMode>,
);

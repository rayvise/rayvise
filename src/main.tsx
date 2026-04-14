import React from "react";
import ReactDOM from "react-dom/client";
import { runLegacyMigrations } from "#/lib/legacyMigration";

async function bootstrap() {
  await runLegacyMigrations();

  const { RenderWindow } = await import("#/components/RenderWindow");
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement,
  );

  root.render(
    <React.StrictMode>
      <RenderWindow />
    </React.StrictMode>,
  );
}

void bootstrap();

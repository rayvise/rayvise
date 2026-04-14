import "#/App.css";
import { Layout } from "#/components/Layout";
import { useApplyDocumentTheme } from "#/hooks/useApplyDocumentTheme";
import { useLegacyStateMigration } from "#/hooks/useLegacyStateMigration";

function App() {
  useLegacyStateMigration();
  useApplyDocumentTheme();

  return <Layout />;
}

export default App;

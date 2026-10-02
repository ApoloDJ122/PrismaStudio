import { useState } from "react";

import CreateProjectDialog from "./components/CreateProjectDialog";
import StartScreen from "./components/StartScreen";
import Workspace from "./components/workspace/Workspace";
import { useProject } from "./hooks/useProject";
import { pickProjectFolder } from "./services/projects";
import "./components/CreateProjectDialog.css";
import "./components/StartScreen.css";
import "./styles/App.css";

function App() {
  const workspace = useProject();
  const [isCreating, setIsCreating] = useState(false);

  if (workspace.project !== null) {
    return <Workspace projectState={workspace} />;
  }

  return (
    <main className="app">
      <StartScreen
        error={workspace.error}
        isBusy={workspace.isBusy}
        isRestoring={workspace.isRestoring}
        onCreate={() => setIsCreating(true)}
        onOpen={workspace.openExistingProject}
      />

      {isCreating && (
        <CreateProjectDialog
          isBusy={workspace.isBusy}
          error={workspace.error}
          onCreate={workspace.createProject}
          onClose={() => setIsCreating(false)}
          onPickFolder={pickProjectFolder}
        />
      )}
    </main>
  );
}

export default App;

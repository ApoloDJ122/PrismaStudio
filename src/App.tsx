import { useState } from "react";

import CreateProjectDialog from "./components/CreateProjectDialog";
import SettingsScreen from "./components/SettingsScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import Workspace from "./components/workspace/Workspace";
import { usePreferences } from "./hooks/usePreferences";
import { useProject } from "./hooks/useProject";
import { pickProjectFolder } from "./services/projects";
import "./components/CreateProjectDialog.css";
import "./styles/App.css";

/**
 * Pantallas de Prisma sin proyecto abierto: bienvenida y configuración.
 * El workspace tiene prioridad: si hay un proyecto, se muestra siempre.
 */
type Screen = "welcome" | "settings";

function App() {
  const project = useProject();
  const preferences = usePreferences();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [isCreating, setIsCreating] = useState(false);
  // Los ajustes se pueden abrir con un proyecto cargado. Al cerrarlos se vuelve
  // al proyecto, no a la bienvenida.
  const [settingsOverWorkspace, setSettingsOverWorkspace] = useState(false);

  if (project.project !== null) {
    return (
      <main className="app">
        <Workspace
          projectState={project}
          theme={preferences.theme}
          onOpenSettings={() => setSettingsOverWorkspace(true)}
        />

        {settingsOverWorkspace && (
          <div className="app-overlay">
            <SettingsScreen
              theme={preferences.theme}
              backLabel="Volver al proyecto"
              error={preferences.error}
              onBack={() => setSettingsOverWorkspace(false)}
              onSelectTheme={preferences.setTheme}
            />
          </div>
        )}
      </main>
    );
  }

  if (screen === "settings") {
    return (
      <main className="app">
        <SettingsScreen
          theme={preferences.theme}
          backLabel="Volver"
          error={preferences.error}
          onBack={() => setScreen("welcome")}
          onSelectTheme={preferences.setTheme}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <WelcomeScreen
        error={project.error}
        isBusy={project.isBusy}
        isRestoring={project.isRestoring}
        onCreate={() => setIsCreating(true)}
        onOpen={project.openExistingProject}
        onSettings={() => setScreen("settings")}
      />

      {isCreating && (
        <CreateProjectDialog
          isBusy={project.isBusy}
          error={project.error}
          onCreate={project.createProject}
          onClose={() => setIsCreating(false)}
          onPickFolder={pickProjectFolder}
        />
      )}
    </main>
  );
}

export default App;

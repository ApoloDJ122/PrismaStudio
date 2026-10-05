import type { ThemeName } from "../types/preferences";
import { THEMES } from "../types/preferences";
import "./SettingsScreen.css";

interface SettingsScreenProps {
  theme: ThemeName;
  /** Texto del botón de vuelta: cambia según de dónde se venga. */
  backLabel: string;
  /** Aviso de que una preferencia no se pudo leer o guardar. */
  error?: string | null;
  onBack: () => void;
  onSelectTheme: (theme: ThemeName) => void;
}

/**
 * Configuración de Prisma.
 *
 * Solo contiene la sección de apariencia, que es lo que existe en M1.5.0. Las
 * secciones siguientes se añadirán aquí cuando haya algo real que configurar.
 */
function SettingsScreen({ theme, backLabel, error, onBack, onSelectTheme }: SettingsScreenProps) {
  return (
    <main className="settings">
      <div className="settings__panel">
        <header className="settings__header">
          <div className="settings__heading">
            <h1 className="settings__title">Configuración</h1>
            <p className="settings__subtitle">Preferencias de Prisma en este equipo.</p>
          </div>

          <button type="button" className="button button--secondary" onClick={onBack}>
            {backLabel}
          </button>
        </header>

        <section className="settings__section" aria-labelledby="settings-appearance">
          <h2 className="settings__sectionTitle" id="settings-appearance">
            Apariencia
          </h2>
          <p className="settings__sectionHint">
            El tema se aplica al instante y se recuerda la próxima vez que abras Prisma.
          </p>

          {error !== null && error !== undefined && (
            <p className="settings__error" role="alert">
              {error}
            </p>
          )}

          <div className="settings__themes" role="radiogroup" aria-label="Tema de la interfaz">
            {THEMES.map((option) => {
              const isSelected = option.name === theme;

              return (
                <button
                  key={option.name}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`theme-option ${isSelected ? "theme-option--selected" : ""}`}
                  onClick={() => onSelectTheme(option.name)}
                >
                  <span
                    className="theme-option__preview"
                    style={{
                      backgroundColor: option.swatch.bg,
                      borderColor: option.swatch.surface,
                    }}
                    aria-hidden="true"
                  >
                    <span
                      className="theme-option__bar"
                      style={{ backgroundColor: option.swatch.surface }}
                    />
                    <span
                      className="theme-option__bar"
                      style={{ backgroundColor: option.swatch.surface }}
                    />
                    <span
                      className="theme-option__dot"
                      style={{ backgroundColor: option.swatch.accent }}
                    />
                  </span>

                  <span className="theme-option__text">
                    <span className="theme-option__label">{option.label}</span>
                    <span className="theme-option__description">{option.description}</span>
                  </span>

                  <span className="theme-option__check" aria-hidden="true">
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

export default SettingsScreen;

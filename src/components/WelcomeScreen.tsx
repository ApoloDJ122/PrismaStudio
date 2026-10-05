import prismaLogo from "../assets/prisma-logo.png";
import "./WelcomeScreen.css";

interface WelcomeScreenProps {
  error: string | null;
  isBusy: boolean;
  isRestoring: boolean;
  onCreate: () => void;
  onOpen: () => void;
  onSettings: () => void;
}

/**
 * Pantalla de bienvenida de Prisma.
 *
 * Es lo primero que se ve cuando no hay ningún proyecto abierto. Solo ofrece lo
 * que ya existe: crear un proyecto, abrir uno existente y entrar en la
 * configuración. No inventa funciones de versiones posteriores.
 */
function WelcomeScreen({
  error,
  isBusy,
  isRestoring,
  onCreate,
  onOpen,
  onSettings,
}: WelcomeScreenProps) {
  const isBlocked = isBusy || isRestoring;

  return (
    <div className="welcome">
      <header className="welcome__bar">
        <span className="welcome__barBrand">Prisma</span>

        <button
          type="button"
          className="button button--ghost button--small"
          onClick={onSettings}
          disabled={isRestoring}
        >
          Configuración
        </button>
      </header>

      <main className="welcome__main">
        <section className="welcome__panel">
          <img className="welcome__logo" src={prismaLogo} alt="" width={64} height={64} />
          <h1 className="welcome__title">Prisma</h1>
          <p className="welcome__message">
            Bienvenido. Abre o crea un proyecto para empezar a trabajar.
          </p>

          <div className="welcome__actions">
            <button
              type="button"
              className="button button--primary welcome__action"
              onClick={onCreate}
              disabled={isBlocked}
            >
              Crear proyecto
            </button>
            <button
              type="button"
              className="button button--secondary welcome__action"
              onClick={onOpen}
              disabled={isBlocked}
            >
              Abrir proyecto
            </button>
          </div>

          {isRestoring && <p className="welcome__status">Recuperando el último proyecto...</p>}

          {error !== null && (
            <p className="welcome__error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default WelcomeScreen;

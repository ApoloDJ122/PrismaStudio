import prismaLogo from "../assets/prisma-logo.png";

interface StartScreenProps {
  error: string | null;
  isBusy: boolean;
  isRestoring: boolean;
  onCreate: () => void;
  onOpen: () => void;
}

function StartScreen({ error, isBusy, isRestoring, onCreate, onOpen }: StartScreenProps) {
  const isBlocked = isBusy || isRestoring;

  return (
    <section className="start-screen">
      <div className="start-screen__panel">
        <header className="start-screen__brand">
          <img className="start-screen__logo" src={prismaLogo} alt="" width={56} height={56} />
          <h1 className="start-screen__title">Prisma</h1>
          <p className="start-screen__description">
            Herramienta visual para agilizar el desarrollo de proyectos.
          </p>
        </header>

        <div className="start-screen__actions">
          <button
            type="button"
            className="button button--primary start-screen__action"
            onClick={onCreate}
            disabled={isBlocked}
          >
            Crear proyecto web
          </button>
          <button
            type="button"
            className="button button--secondary start-screen__action"
            onClick={onOpen}
            disabled={isBlocked}
          >
            Abrir proyecto
          </button>
        </div>

        {isRestoring && <p className="start-screen__status">Recuperando el último proyecto...</p>}

        {error !== null && <p className="start-screen__error">{error}</p>}
      </div>
    </section>
  );
}

export default StartScreen;

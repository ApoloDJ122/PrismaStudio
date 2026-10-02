interface StartScreenProps {
  error: string | null;
  isBusy: boolean;
  onCreate: () => void;
  onOpen: () => void;
}

function StartScreen({ error, isBusy, onCreate, onOpen }: StartScreenProps) {
  return (
    <section className="start-screen">
      <div className="start-screen__panel">
        <header className="start-screen__brand">
          <span className="start-screen__logo" aria-hidden="true">
            P
          </span>
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
            disabled={isBusy}
          >
            Crear proyecto web
          </button>
          <button
            type="button"
            className="button button--secondary start-screen__action"
            onClick={onOpen}
            disabled={isBusy}
          >
            Abrir proyecto
          </button>
        </div>

        {error !== null && <p className="start-screen__error">{error}</p>}
      </div>
    </section>
  );
}

export default StartScreen;

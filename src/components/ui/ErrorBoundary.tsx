import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fallo en la interfaz de Prisma", error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div className="crash">
          <h1 className="crash__title">Algo ha fallado en Prisma</h1>
          <p className="crash__text">
            La aplicacion no pudo continuar. Puedes recargar la ventana; los archivos del
            proyecto no se han modificado.
          </p>
          <pre className="crash__detail">{this.state.error.message}</pre>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

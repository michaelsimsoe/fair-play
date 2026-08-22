import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../components/ui";

type State = { error?: Error };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("FairPlay crashed", error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="centered-page">
        <div className="card card--danger">
          <p className="eyebrow">Noe gikk galt</p>
          <h1>Appen kunne ikke vises</h1>
          <p>
            Lokale data er ikke slettet. Last siden på nytt, eller eksporter data fra
            innstillinger hvis problemet fortsetter.
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Last inn på nytt
          </Button>
        </div>
      </main>
    );
  }
}

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  children: ReactNode;
  /** Shown in dev / “view raw” for support */
  schemaHint?: unknown;
};

type State = { error: Error | null; showRaw: boolean };

export class ArtboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showRaw: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, showRaw: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ArtboardErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const raw =
        this.props.schemaHint !== undefined
          ? JSON.stringify(this.props.schemaHint, null, 2)
          : null;

      return (
        <Card className="border-destructive/50 bg-destructive/5 m-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This screen has a rendering issue</CardTitle>
            <CardDescription>{this.state.error.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                this.setState((s) => ({ ...s, showRaw: !s.showRaw }))
              }
            >
              {this.state.showRaw ? "Hide raw schema" : "View raw schema"}
            </Button>
            {this.state.showRaw && raw ? (
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 text-xs">
                {raw}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

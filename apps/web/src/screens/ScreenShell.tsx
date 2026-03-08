import type { PropsWithChildren, ReactNode } from "react";

type ScreenShellProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  status?: ReactNode;
  loadingLabel?: string | null;
}>;

function LoadingIndicator({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 999,
        background: "rgba(15, 28, 21, 0.72)",
        border: "1px solid rgba(122,255,195,0.24)",
        color: "#eafff4",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span className="app-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ScreenShell({
  title,
  subtitle,
  footer,
  status,
  loadingLabel,
  children,
}: ScreenShellProps) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100vw",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "calc(env(safe-area-inset-top) + 20px)",
        paddingRight: "calc(env(safe-area-inset-right) + 16px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
        paddingLeft: "calc(env(safe-area-inset-left) + 16px)",
        background:
          "radial-gradient(circle at top, rgba(37,125,88,0.38), transparent 34%), linear-gradient(180deg, #0e4534 0%, #09281f 100%)",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 100%)",
        }}
      />
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "22px 18px 18px",
          borderRadius: 24,
          background: "rgba(8, 14, 10, 0.76)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {status ? <div style={{ marginBottom: 14 }}>{status}</div> : null}
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05 }}>{title}</h1>
        {subtitle ? (
          <p
            style={{
              marginTop: 10,
              marginBottom: 20,
              color: "rgba(255,255,255,0.78)",
              fontSize: 15,
            }}
          >
            {subtitle}
          </p>
        ) : null}
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
        {loadingLabel ? (
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <LoadingIndicator label={loadingLabel} />
          </div>
        ) : null}
        {footer ? <div style={{ marginTop: 18 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

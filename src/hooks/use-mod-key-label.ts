import * as React from "react";

function detectIsMac() {
  const platform = navigator.platform;
  const userAgent = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(userAgent);
}

export function useModKeyLabel() {
  const [modKeyLabel, setModKeyLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    setModKeyLabel(detectIsMac() ? "Cmd" : "Ctrl");
  }, []);

  return modKeyLabel;
}

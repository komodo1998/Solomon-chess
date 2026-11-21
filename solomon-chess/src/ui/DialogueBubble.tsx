import { useEffect, useState } from "react";
import { useGame } from "../game/store";

export function DialogueBubble() {
  const dialogue = useGame((s) => s.dialogue);
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!dialogue) return;
    setShown("");
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setShown(dialogue.text.slice(0, i));
      if (i >= dialogue.text.length) clearInterval(iv);
    }, 22);
    return () => clearInterval(iv);
  }, [dialogue?.id, dialogue]);
  if (!dialogue) return null;
  return (
    <div className="dialogue panel" key={dialogue.id}>
      <span className="who">Solomon</span>
      {shown}
    </div>
  );
}

import { useEffect, useState } from "react";

const getPosition = () => ({ x: window.scrollX, y: window.scrollY });

export default function useWindowScroll() {
  const [position, setPosition] = useState(getPosition);

  useEffect(() => {
    const handleScroll = () => setPosition(getPosition());

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return position;
}

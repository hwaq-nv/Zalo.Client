import { useEffect, useState } from "react";

const getSize = () => ({ width: window.innerWidth, height: window.innerHeight });

export default function useWindowResize() {
  const [size, setSize] = useState(getSize);

  useEffect(() => {
    const handleResize = () => setSize(getSize());

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}

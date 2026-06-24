export const inkFadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
}

export const inkFadeInStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
}

export interface Poem {
  title: string
  author: string
  dynasty: string
  /** 每句诗为一列,从右向左排列 */
  lines: string[]
}

export const poems: Poem[] = [
  {
    title: "静夜思",
    author: "李白",
    dynasty: "唐",
    lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
  },
  {
    title: "相思",
    author: "王维",
    dynasty: "唐",
    lines: ["红豆生南国", "春来发几枝", "愿君多采撷", "此物最相思"],
  },
  {
    title: "鹿柴",
    author: "王维",
    dynasty: "唐",
    lines: ["空山不见人", "但闻人语响", "返景入深林", "复照青苔上"],
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    dynasty: "唐",
    lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"],
  },
  {
    title: "竹里馆",
    author: "王维",
    dynasty: "唐",
    lines: ["独坐幽篁里", "弹琴复长啸", "深林人不知", "明月来相照"],
  },
  {
    title: "江雪",
    author: "柳宗元",
    dynasty: "唐",
    lines: ["千山鸟飞绝", "万径人踪灭", "孤舟蓑笠翁", "独钓寒江雪"],
  },
  {
    title: "山中",
    author: "王勃",
    dynasty: "唐",
    lines: ["长江悲已滞", "万里念将归", "况属高风晚", "山山黄叶飞"],
  },
]

export function randomPoem(): Poem {
  return poems[Math.floor(Math.random() * poems.length)]
}

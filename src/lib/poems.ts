export interface Poem {
  title: string
  author: string
  dynasty: string
  lines: string[]
}

export const jingYeSi: Poem = {
  title: '静夜思',
  author: '李白',
  dynasty: '唐',
  lines: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],
}

export const zhuLiGuan: Poem = {
  title: '竹里馆',
  author: '王维',
  dynasty: '唐',
  lines: ['独坐幽篁里', '弹琴复长啸', '深林人不知', '明月来相照'],
}

export const REPRESENTATIVE_QUIZ_POEMS = [
  { id: 'TANG_001', title: '静夜思', reason: '短诗 demo 与思乡主题基线' },
  { id: 'TANG_002', title: '春晓', reason: '生成器测试诗与小学高频篇目' },
  { id: 'TANG_010', title: '望岳', reason: '写景、炼字与志向表达' },
  { id: 'TANG_016', title: '夜雨寄北', reason: '时空转换与思念主题' },
  { id: 'TANG_023', title: '九月九日忆山东兄弟', reason: '对写法与思乡主题 demo' },
  { id: 'TANG_030', title: '送杜少府之任蜀州', reason: '送别诗与开阔友情观' },
  { id: 'TANG_031', title: '次北固山下', reason: '律诗结构与哲理名句' },
  { id: 'TANG_032', title: '使至塞上', reason: '边塞意象与名句赏析' },
  { id: 'TANG_033', title: '闻王昌龄左迁龙标遥有此寄', reason: '拟人与寄情于物' },
  { id: 'TANG_039', title: '黄鹤楼', reason: '律诗写景与乡愁' },
  { id: 'TANG_040', title: '春望', reason: '情景交融与忧国伤时' },
  { id: 'TANG_042', title: '登高', reason: '长诗 demo 与复杂情感' },
  { id: 'TANG_049', title: '钱塘湖春行', reason: '写景层次与炼字' },
  { id: 'TANG_053', title: '望月怀远', reason: '月夜意象与怀人主题' },
] as const

export const REPRESENTATIVE_QUIZ_POEM_IDS = REPRESENTATIVE_QUIZ_POEMS.map(poem => poem.id)
export const REPRESENTATIVE_QUIZ_TARGET = REPRESENTATIVE_QUIZ_POEMS.length
export const REPRESENTATIVE_V2_MIN_QUESTIONS = 80
export const REPRESENTATIVE_V2_MAX_QUESTIONS = 110

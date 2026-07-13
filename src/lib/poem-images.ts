export const POEM_IMAGE_BY_ID: Readonly<Record<string, string>> = {
  TANG_001: '/yijing/poems/poem-tang-001-jingyesi.jpg',
  TANG_002: '/yijing/poems/poem-tang-002-chunxiao.jpg',
  TANG_010: '/yijing/poems/poem-tang-010-wangyue.jpg',
  TANG_016: '/yijing/poems/poem-tang-016-yeyujibei.jpg',
  TANG_023: '/yijing/poems/poem-tang-023-jiuyuejiu.jpg',
  TANG_030: '/yijing/poems/poem-tang-030-songdushaofu.jpg',
  TANG_031: '/yijing/poems/poem-tang-031-cibeigushanxia.jpg',
  TANG_032: '/yijing/poems/poem-tang-032-shizhisaishang.jpg',
  TANG_033: '/yijing/poems/poem-tang-033-wenwangchangling.jpg',
  TANG_039: '/yijing/poems/poem-tang-039-huanghelou.jpg',
  TANG_040: '/yijing/poems/poem-tang-040-chunwang.jpg',
  TANG_042: '/yijing/poems/poem-tang-042-denggao.jpg',
  TANG_049: '/yijing/poems/poem-tang-049-qiantanghuchunxing.jpg',
  TANG_053: '/yijing/poems/poem-tang-053-wangyuehuaiyuan.jpg',
}

const FRONTIER_POEM_IDS = new Set([
  'EXTRA_007',
  'EXTRA_008',
  'TANG_017',
  'TANG_018',
  'TANG_062',
  'TANG_064',
  'TANG_094',
  'TANG_095',
])

export function getPoemImage(poemId: string): string | undefined {
  return POEM_IMAGE_BY_ID[poemId]
    ?? (FRONTIER_POEM_IDS.has(poemId) ? '/yijing/poems/theme-t07-frontier.jpg' : undefined)
}

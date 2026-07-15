import { expect, test, type Page } from '@playwright/test'

const userName = process.env.E2E_USER_NAME
const password = process.env.E2E_USER_PASSWORD
const hasCredentials = Boolean(userName && password)

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('名字').fill(userName ?? '')
  await page.getByLabel('密码').fill(password ?? '')
  await page.getByRole('button', { name: '进来' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.getByRole('navigation')).toContainText('今日案头')
}

test('public entry redirects to the login experience', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '回来了' })).toBeVisible()
  await expect(page.getByRole('link', { name: '注册' })).toHaveAttribute('href', '/register')
})

test.describe('signed-in learning flow', () => {
  test.skip(!hasCredentials, 'Set E2E_USER_NAME and E2E_USER_PASSWORD to run signed-in smoke tests.')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('opens conversation history and returns to the desk', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '今日青藤札记' })).toBeVisible()

    const continueButton = page.getByRole('button', { name: '继续对话' })
    if (await continueButton.isVisible()) {
      await continueButton.click()
      await expect(page.getByText('与青藤对话', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '返回案头' }).click()
      await expect(page.getByRole('heading', { name: '今日青藤札记' })).toBeVisible()
    }

    await page.getByRole('button', { name: '历史对话' }).click()
    await expect(page.getByRole('dialog', { name: '旧日对话' })).toBeVisible()
    await expect(page.getByText('回到曾经读诗和交谈的地方')).toBeVisible()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '旧日对话' })).toBeHidden()
  })

  test('moves from the poem map to teacher annotations without model cost', async ({ page }) => {
    await page.route('**/api/quiz/judge', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isCorrect: true,
          completionRate: 1,
          answer: '自动化测试参考答案',
          explanation: '题目已完成确定性批注验证。',
          hitPoints: ['已覆盖核心考点'],
          missedPoints: [],
          feedback: '答题页批注链路正常。',
        }),
      })
    })

    await page.getByRole('link', { name: '诗笺地图' }).click()
    await expect(page).toHaveURL(/\/poems$/)
    await page.getByPlaceholder(/想读点什么/).fill('静夜思')
    await expect(page.getByText('静夜思', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: '青藤考你' }).first().click()

    await expect(page).toHaveURL(/\/quiz\/TANG_001/)
    await expect(page.getByText(/第 1 题/)).toBeVisible({ timeout: 15_000 })

    const textarea = page.getByPlaceholder('请写下你的回答...')
    const fillInput = page.getByPlaceholder('请填写答案...')
    if (await textarea.isVisible()) {
      await textarea.fill('自动化测试回答')
    } else if (await fillInput.isVisible()) {
      await fillInput.fill('自动化测试回答')
    } else {
      await page.locator('button').filter({ hasText: /^[A-D]/ }).first().click()
    }

    await page.getByRole('button', { name: '交卷' }).click()
    await expect(page.getByText('先生批注')).toBeVisible()
    await expect(page.getByText('掌握度')).toBeVisible()
  })
})

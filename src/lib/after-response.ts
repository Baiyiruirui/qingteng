import { after } from 'next/server'

export async function scheduleAfterResponse(
  label: string,
  task: () => Promise<void>,
): Promise<void> {
  const guardedTask = async () => {
    try {
      await task()
    } catch (error) {
      console.error(`[${label}] failed:`, error)
    }
  }

  try {
    after(guardedTask)
  } catch (error) {
    console.error(`[${label}] could not be scheduled; running inline:`, error)
    await guardedTask()
  }
}

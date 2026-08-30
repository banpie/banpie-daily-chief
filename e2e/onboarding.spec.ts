import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("新人从真实体检走到首份可接受预览", async ({ page }) => {
  await page.goto("/?token=daily-chief-e2e-token");
  await expect(page.getByRole("heading", { name: "先选择你看得最舒服的语言" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Choose the language you prefer" })).toBeVisible();
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("heading", { name: "先选择你看得最舒服的语言" })).toBeVisible();
  await page.getByRole("button", { name: /继续/ }).click();
  await expect(page.getByRole("heading", { name: "这是当前宿主的真实体检" })).toBeVisible();
  await expect(page.getByText(/宿主:\s*Current host unknown/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "这是当前宿主的真实体检" })).toBeVisible();
  await page.getByRole("button", { name: /继续/ }).click();
  await expect(page.getByRole("heading", { name: "告诉我一天的大致边界" })).toBeVisible();
  await page.getByRole("button", { name: /继续/ }).click();
  await page.getByRole("button", { name: /其他设备/ }).click();
  await page.getByRole("checkbox", { name: /标准文件/ }).check();
  await page.getByRole("button", { name: /继续/ }).click();
  await expect(page.getByRole("heading", { name: "本地收集箱已经就绪" })).toBeVisible();
  await page.getByLabel("选择标准文件").setInputFiles({ name: "导入任务.csv", mimeType: "text/csv", buffer: Buffer.from("title,status\n导入的备用任务,someday\n") });
  await expect(page.getByText(/已导入 导入任务.csv/)).toBeVisible();
  await page.getByRole("button", { name: /继续/ }).click();

  const taskInputs = page.locator(".draft-task input");
  await taskInputs.nth(0).fill("完成新人验收报告");
  await taskInputs.nth(1).fill("回复合作确认");
  await taskInputs.nth(2).fill("整理本周收集箱");
  await page.getByRole("button", { name: /生成首份预览/ }).click();
  await expect(page.getByRole("heading", { name: "这是你的首份今日预览" })).toBeVisible();
  await expect(page.getByText("完成新人验收报告", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /接受并进入工作台/ }).click();
  await expect(page.getByText("已接受今天的计划")).toBeVisible();
});

test("本地任务和项目可以完整维护", async ({ page }) => {
  await page.goto("/tasks?token=daily-chief-e2e-token");
  await page.getByRole("button", { name: "编辑任务" }).first().click();
  const taskDialog = page.getByRole("dialog", { name: "编辑任务" });
  await taskDialog.getByLabel("下一步", { exact: true }).fill("补齐浏览器证据");
  await taskDialog.locator("label").filter({ hasText: /^重复/ }).locator("select").selectOption("daily");
  await taskDialog.getByRole("button", { name: /保存任务/ }).click();
  await expect(page.getByText("重复系列").first()).toBeVisible();
  await page.getByRole("button", { name: "完成今天这次" }).first().click();
  await expect(page.getByRole("button", { name: "恢复今天这次" }).first()).toBeVisible();

  await page.getByRole("link", { name: "项目" }).click();
  await page.getByRole("button", { name: /新建项目/ }).click();
  const projectDialog = page.getByRole("dialog", { name: "新建项目" });
  await projectDialog.getByLabel("项目名称").fill("稳定版发布");
  await projectDialog.getByLabel("目标结果").fill("新人十分钟看到首份预览");
  await projectDialog.getByLabel("当前焦点").fill("自动化验收");
  await projectDialog.getByLabel("下一步", { exact: true }).fill("执行双宿主验证");
  await projectDialog.getByRole("button", { name: /保存项目/ }).click();
  await expect(page.getByRole("heading", { name: "稳定版发布" })).toBeVisible();
  await expect(page.getByText("新人十分钟看到首份预览")).toBeVisible();
});

test("日计划阻止无效时间并适配手机宽度", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?token=daily-chief-e2e-token");
  await expect(page.locator(".shell")).toBeVisible();
  await page.screenshot({ path: "output/playwright/今日计划桌面.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.screenshot({ path: "output/playwright/今日计划手机宽度.png", fullPage: true });
  const firstBlock = page.locator(".block-editor").first();
  const start = firstBlock.locator('input[type="datetime-local"]').nth(0);
  const end = firstBlock.locator('input[type="datetime-local"]').nth(1);
  await end.fill(await start.inputValue());
  await expect(page.getByRole("alert")).toBeVisible();
});

test("英文设置覆盖向导和主要工作台页面", async ({ page }) => {
  await page.goto("/settings?token=daily-chief-e2e-token");
  await page.getByLabel("语言").selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Edit task" }).first().click();
  await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("link", { name: "Connections" }).click();
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  await page.getByRole("link", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: "Runs" })).toBeVisible();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText("Today's judgment")).toBeVisible();
});

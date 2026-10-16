import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("confirms natural language entries and persists them", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "家庭总览", exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("例如：中午吃快餐花了25元")
    .fill("中午吃快餐花了25元");
  await page.getByRole("button", { name: "解析记账" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("金额（元）")).toHaveValue("25.00");
  await page.getByRole("button", { name: "确认入账", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "收支账本", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "中午吃快餐花了25元", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "收支账本", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "中午吃快餐花了25元", exact: true }),
  ).toBeVisible();
});
test("filters by member and accepts a previewed CSV only once", async ({
  page,
}) => {
  await page.getByRole("button", { name: "陈一", exact: true }).first().click();
  await expect(page.getByText("陈一的财务概况")).toBeVisible();
  await page.getByRole("button", { name: "全部成员", exact: true }).click();
  await page
    .getByRole("button", { name: "导入账单", exact: true })
    .first()
    .click();
  await page.getByLabel("选择 CSV 文件").setInputFiles({
    name: "test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "日期,类型,金额,备注,交易单号\n2026-10-16,支出,19.80,测试导入午餐,E2E001",
    ),
  });
  await expect(page.getByText("可导入 1 笔")).toBeVisible();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "导入账单", exact: true })
    .first()
    .click();
  await page.getByLabel("选择 CSV 文件").setInputFiles({
    name: "test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "日期,类型,金额,备注,交易单号\n2026-10-16,支出,19.80,测试导入午餐,E2E001",
    ),
  });
  await expect(page.getByText("重复 1 笔")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeDisabled();
});
test("supports account creation, valuations, backup and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "资产配置", exact: true }).click();
  await page.getByRole("button", { name: "添加账户", exact: true }).click();
  await page.getByLabel("账户名称").fill("测试储蓄");
  await page.getByLabel("初始估值（元）").fill("1234.56");
  await page.getByRole("button", { name: "保存账户", exact: true }).click();
  await expect(page.getByText("测试储蓄", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "数据连接", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份", exact: true }).click();
  expect((await download).suggestedFilename()).toContain(".json");
});
test("updates valuations, calculates reports and rejects an invalid backup", async ({
  page,
}) => {
  await page.getByRole("button", { name: "资产配置", exact: true }).click();
  await page
    .getByRole("button", { name: "更新估值 ↗", exact: true })
    .first()
    .click();
  await page.getByLabel("估值金额（元）").fill("88888.88");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("¥ 88,888.88", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收益分析", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "读懂你的回报" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-20");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-01");
  await expect(page.getByRole("alert")).toContainText(
    "结束日期不能早于开始日期",
  );
  await page.getByRole("button", { name: "数据连接", exact: true }).click();
  await page.getByRole("button", { name: "恢复本机备份", exact: true }).click();
  await page.getByLabel("选择 JSON 备份").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":42}'),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "不支持的备份版本",
  );
  await expect(
    page.getByRole("button", { name: "确认替换并恢复" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("mobile navigation keeps every page within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "家庭总览",
    "收支账本",
    "资产配置",
    "收益分析",
    "数据连接",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      name,
    ).toBeLessThanOrEqual(390);
  }
});

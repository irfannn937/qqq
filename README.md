# A 股资金动向日报 GitHub Actions 版

这套文件可以让 GitHub 每个交易日北京时间 16:30 自动运行，抓取 A 股公开行情/资金流数据，并通过 QQ 邮箱把简报发送给你。

## 你需要准备

- 一个 GitHub 账号
- 一个私有仓库
- QQ 邮箱 SMTP 授权码

## 第一步：创建私有仓库

1. 打开 GitHub，点右上角 `+`。
2. 选择 `New repository`。
3. Repository name 可以填：`a-stock-daily-report`。
4. 选择 `Private`。
5. 创建仓库。

## 第二步：上传这些文件

把本文件夹里的所有内容上传到仓库根目录，上传后仓库里应该能看到：

```text
.github/workflows/a-stock-report.yml
scripts/a-stock-report.mjs
README.md
```

## 第三步：设置 Secrets

进入仓库页面：

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

逐个添加：

```text
EMAIL_TO=437482997@qq.com
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=437482997@qq.com
SMTP_FROM=437482997@qq.com
SMTP_PASS=你的QQ邮箱SMTP授权码
```

注意：`SMTP_PASS` 不要写到代码里，只放到 GitHub Secret。

## 第四步：手动测试一次

进入仓库页面：

`Actions` -> `A Stock Daily Report` -> `Run workflow`

运行完成后，去 QQ 邮箱看是否收到邮件。

## 第五步：自动运行

工作流已设置为：

```text
北京时间每周一到周五 16:30
```

对应 GitHub Actions 的 UTC 时间：

```text
30 8 * * 1-5
```

## 注意

- GitHub Actions 定时任务可能有几分钟延迟，这是正常现象。
- 如果当天 A 股休市，公开行情接口可能仍返回旧数据。稳妥做法是后续再加中国节假日交易日校验。
- 邮件内容仅供观察资金动向，不构成投资建议。

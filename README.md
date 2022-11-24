# nj12320-appointment

> 此脚本最终只能生成预约链接，最后的下单还是需要手动操作，因为我不知道怎么过最后确认下单的那个图片验证码(；′⌒`)...
> 如果有大佬有思路，欢迎提issue或pr

这是一个基于TypeScript的南京公众健康服务平台预约挂号脚本
验证码识别使用[tesseract.js](https://github.com/naptha/tesseract.js)

## 功能

- [x] 自动登录&识别验证码
- [x] 自动查询指定医院医生的号源及可预约时间
- [x] 生成预约链接
- [x] 循环查询、自动重试
- [ ] 自动预约下单（**未实现**） 

## 使用方法

> 注意：首次使用时tesseract.js可能需要加载较长时间，如果长时间无法加载，请尝试使用代理

1. 安装依赖
    ```bash
    npm install
    ```
2. 创建你自己的配置文件
    ```bash
    cp config-example.yml config.yml
    ```
3. 修改配置文件
4. 使用ts-node运行或编译为js文件运行
    ```bash
    npm start
    ```
    or
    ```bash
    npm run build
    ```
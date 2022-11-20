# nj12320-appointment

这是一个基于TypeScript的南京公众健康服务平台预约挂号脚本
验证码识别使用[tesseract.js](https://github.com/naptha/tesseract.js)

## 使用方法

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
import axios from 'axios';
import yaml from 'js-yaml';
import { createWorker } from 'tesseract.js';
import { md5 } from './lib/MD5';
import { encryptedString, RSAKeyPair, setMaxDigits } from './lib/RSA';
import { JSDOM } from 'jsdom';
import FormData from 'form-data';

const fs = require('fs');

/**
 * ========类型定义========
 */

type LoginRes = {
    flagState: number;
    message: string;
}

type DateScheduleInfo = {
    hoscode: string;
    schcode: string;
    docid: string;
    // 'am' / 'pm'
    type: string;
}

type TimeScheduleInfo = {
    // 时间段标识
    code: string;
    // 时间段
    startHour: string;
    endHour: string;
    // 预约状态，1为可预约
    state: number;
    // 最晚取号时间
    takeTime: string;
}


/**
 * ========常量区========
 */

// 默认配置文件路径
const defaultConfigFilePath = './config.yml';
// nj12320获取验证码api的url
const captchaUrl = 'https://www.nj12320.org/njres/authImg.do';


/**
 * ========函数区========
 */

// cookie
let cookie = [];
// 读取指定的yaml文件
function readYamlFile(filePath: string) {
    const file = fs.readFileSync(filePath, 'utf8');
    return yaml.load(file);
}
// 验证码识别
const worker = createWorker();
async function initWorker() {
    console.log('tesseract.js', '加载引擎...')
    await worker.load();
    console.log('tesseract.js', '加载模型...')
    await worker.loadLanguage('eng');
    console.log('tesseract.js', '初始化模型...')
    await worker.initialize('eng');
    console.log('tesseract.js', '正在识别...')
}
async function recognizeCaptcha(url: string) {
    const res = await axios.request({
        url,
        method: 'get',
        responseType: 'arraybuffer',
        headers: {
            'Cookie': cookie
        }
    });
    const { data } = res;
    let { data: { text } } = await worker.recognize(data);
    text = text.replace(/[ ]/g, '').replace(/[\r]/g, '').replace(/[\n]/g, '');
    console.log('tesseract.js', '识别结果：' + text);
    return text;
}
// 加密
function encrypt(str: string) {
    const publicKey = "b103b0e219862acf0c51b7cee921062684dab5aab44817ee1f32f54e7424793ca5f5410fce5476658771991f27146a46da03bcc599a4a586e0bbbc6bcb8b3e4909d85420cd8b1541d397e07d740fd79d318284b153442d13c33a0028e7868ce6ac6ee9766f04bb500465920122f9192df555b7d625cb7958c62c0ccd614454df";
    setMaxDigits(130);
    const key = new RSAKeyPair("10001", '', publicKey);
    return encryptedString(key, str);
}
// nj12320登录
async function login(username: string, password: string, verifyCode: string) {
    const res = await axios.request<LoginRes>({
        url: 'https://www.nj12320.org/njres/indexJson/login.do',
        method: 'post',
        params: {
            timestamp: (new Date()).valueOf(),
            ajax: true,
            username, password, verifyCode
        },
        headers: {
            'Cookie': cookie
        }
    });
    return res.data;
}
// 查询可预约日期
async function queryAvailableDate(hoscode: number, docid: number) {
    const res = await axios.request({
        url: 'https://www.nj12320.org/njres/reservation/doc_detail.do',
        method: 'get',
        params: {
            hoscode, docid
        },
        headers: {
            'Cookie': cookie
        }
    });
    const document = JSDOM.fragment(res.data);
    const availableDate: { [k: string]: Array<DateScheduleInfo> } = {};
    const dateDom = Array.from(document.querySelectorAll('thead th b'));
    const dateLength = dateDom.length;
    const amDom = Array.from(document.querySelectorAll('.yy_paiban tbody tr:nth-child(1) td')).slice(1, dateLength + 1);
    const pmDom = Array.from(document.querySelectorAll('.yy_paiban tbody tr:nth-child(2) td')).slice(1, dateLength + 1);
    const timeDom = [amDom, pmDom];
    // 遍历每一个可选日期，获取可预约的am/pm信息
    for (let i = 0; i < dateLength; i++) {
        const date = dateDom[i].textContent;
        for (let dom of timeDom) {
            const infoDom = dom[i].querySelector('.doc_yuyue_time a');
            if (date !== null && infoDom !== null) {
                availableDate[date] = availableDate[date] ?? [];
                const text = (infoDom as HTMLLinkElement).href;
                const dataArr = text.substring(text.indexOf('(') + 1, text.indexOf(')')).replace(/'/g, '').split(',');
                availableDate[date].push({
                    hoscode: dataArr[0],
                    schcode: dataArr[1],
                    type: dataArr[2],
                    docid: dataArr[3],
                });
            }
        }
    }
    return availableDate;
}
// 获取具体可预约时间段
async function queryAvailableTime(info: DateScheduleInfo) {
    // 转成FormData
    const formData = new FormData();
    formData.append('hoscode', info.hoscode);
    formData.append('schcode', info.schcode);
    formData.append('type', info.type);
    formData.append('docid', info.docid);
    const res = await axios.request<string>({
        url: `https://www.nj12320.org/njres/reservationJson/showScheduleTime.do?timestamp=${(new Date()).valueOf()}&ajax=true`,
        method: 'post',
        data: formData,
        headers: {
            'Cookie': cookie
        }
    });
    return JSON.parse(res.data) as Array<TimeScheduleInfo>;
}
// 生成预约网址
function generateReservationUrl(dateInfo: DateScheduleInfo, timeInfo: TimeScheduleInfo) {
    return `https://www.nj12320.org/njres/reservation/hos_toConfirm.do?schcode=${dateInfo.schcode}&hosCfgCode=${timeInfo.code}`;
}
// 登录测试
async function testLogin() {
    const res = await axios.request({
        url: "https://www.nj12320.org/njres/index_toLogin.do",
        method: 'get'
    });
    cookie = res.headers['set-cookie'];
}


/**
 * ========主程序========
 */

let retryCount = 0;
let isSuccess = false;

// 设置axios：允许携带cookie
axios.defaults.withCredentials = true;

// 读取配置文件
let config: any = null;
try {
    config = readYamlFile(defaultConfigFilePath);
    if (config.debugMode) {
        console.log('配置：', config);
    }
} catch (e) {
    console.log('读取配置文件失败...', e);
}

async function main() {
    if (config === null) {
        return;
    }
    try {
        await testLogin();
        let captchaSuccess = false;
        while (!captchaSuccess) {
            // 验证码识别
            console.log('开始获取验证码...');
            const captcha = await recognizeCaptcha(captchaUrl);
            if (config.debugMode) {
                console.log(`验证码识别结果：${captcha}`);
            }
            // 登录操作
            console.log('正在登录...');
            const username = encrypt(config.username);
            const password = encrypt(md5(config.password));
            if (config.debugMode) {
                console.log(`原始用户名：${config.username}，加密后：${username}`);
                console.log(`原始密码：${config.password}，加密后：${password}`);
            }
            const loginRes = await login(username, password, captcha);
            if (config.debugMode) {
                console.log(`登录结果：`, loginRes);
            }
            if (loginRes.message === '验证码输入不正确！') {
                console.log('验证码识别失败，自动重试...');
                continue;
            }
            if (loginRes.message !== 'success') {
                throw new Error('登录失败，返回信息：' + loginRes.message);
            } else {
                captchaSuccess = true;
            }
        }
        // 查询可预约日期
        console.log('正在查询可预约日期...');
        const availableDate = await queryAvailableDate(config.hoscode, config.docid);
        if (config.debugMode) {
            console.log(`可预约日期：`, availableDate);
        }
        let dateInfo: DateScheduleInfo[] | null = null;
        let orderDate = '';
        if (config.mode === 'order') {
            orderDate = config.date;
            if (!availableDate[orderDate]) {
                if (!config.loop) {
                    console.log(`指定的日期 ${orderDate} 目前还不可预约`);
                    console.log('未开启循环抢号，将自动切换到随机模式...');
                    config.mode = 'random';
                } else {
                    throw new Error(`指定的日期 ${orderDate} 目前还不可预约`);
                }
            }
            dateInfo = availableDate[orderDate];
        }
        if (config.mode === 'random') {
            const dateList = Object.keys(availableDate);
            if (dateList.length === 0) {
                throw new Error('当前没有可预约的日期');
            }
            orderDate = dateList[Math.floor(Math.random() * dateList.length)];
            dateInfo = availableDate[orderDate];
        }
        if (dateInfo === null) {
            throw new Error('未找到可预约的日期');
        }
        if (config.debugMode) {
            console.log(`预约日期：${orderDate}`);
            console.log(`预约信息：`, dateInfo);
        }
        // 查询可预约时间段
        console.log('正在查询可预约时间段...');
        let timeInfo: TimeScheduleInfo[][] = [];
        for (let info of dateInfo) {
            timeInfo.push(await queryAvailableTime(info));
        }
        if (config.debugMode) {
            console.log(`可预约时间段：`, timeInfo);
        }
        // 生成预约网址
        console.log(`正在生成日期 ${orderDate} 的预约网址...`);
        for (let date of dateInfo) {
            console.log(date.type + "：");
            for (let time of timeInfo[dateInfo.indexOf(date)]) {
                if (time.state !== 1) {
                    continue;
                }
                const url = generateReservationUrl(date, time);
                console.log(url);
            }
        }
        isSuccess = true;
    } catch (e) {
        console.log('============================');
        console.error('捕获到异常(´。＿。｀)\n', e);
        console.log('============================');
        if (retryCount < config.max_retry) {
            retryCount++;
            console.log(`第${retryCount}次重试...（最大尝试次数：${config.max_retry}）`);
            main();
        }
    }
}

(async function () {
    // 初始化tesseract.js
    await initWorker();

    if (config) {
        if (config.loop) {
            console.log('========循环抢号模式==========');
            while (!isSuccess) {
                await main();
                console.log(`等待${config.interval}ms...`);
                await new Promise(resolve => setTimeout(resolve, config.interval));
            }
        } else {
            console.log('========单次抢号模式==========');
            await main();
        }
    }
})();
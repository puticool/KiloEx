const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const headers = require("./src/header").default;
const printLogo = require("./src/logo");
const log = require('./src/logger');

class KiloexAPIClient {
    constructor() {
        this.headers = headers;
        this.log = log;
        this.proxies = this.loadProxies();
    }

    loadProxies() {
        try {
            const proxyFile = path.join(__dirname, 'proxy.txt');
            if (!fs.existsSync(proxyFile)) {
                this.log('Proxy file not found', 'warning');
                return [];
            }
            return fs.readFileSync(proxyFile, 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean)
                .map(line => line.trim());
        } catch (error) {
            this.log(`Error reading proxy file: ${error.message}`, 'error');
            return [];
        }
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Unable to check proxy IP. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error checking proxy IP: ${error.message}`);
        }
    }

    getAxiosConfigWithProxy(index) {
        if (this.proxies.length > 0 && this.proxies[index]) {
            return {
                headers: this.headers,
                httpsAgent: new HttpsProxyAgent(this.proxies[index]),
                timeout: 30000
            };
        }
        return { headers: this.headers };
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async retryWithDelay(fn, retries = 3, delay = 5000) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (error?.response?.data?.msg?.includes('too quickly') && i < retries - 1) {
                    this.log(`Waiting ${delay /1000}s before retrying...`, 'warning');
                    await this.sleep(delay);
                    continue;
                }
                throw error;
            }
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            const timestamp = new Date().toLocaleTimeString();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${timestamp}] [*] Waiting ${i} seconds to continue...`);
            await this.sleep(1000);
        }
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
    }

    async getUserInfo(account, name, config) {
        return await this.retryWithDelay(async () => {
            const url = `https://opapi.kiloex.io/tg/user/info?account=${account}&name=${name}&from=kiloextrade`;
            try {
                const response = await axios.get(url, config);
                if (response.status === 200 && response.data.status === true) {
                    return { success: true, data: response.data.data };
                } else {
                    return { success: false, error: response.data.msg };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    async checkAndBindReferral(account, config) {
        return await this.retryWithDelay(async () => {
            const checkUrl = `https://opapi.kiloex.io/tg/referral/code?account=${account}`;
            try {
                const checkResponse = await axios.get(checkUrl, config);
                
                if (checkResponse.status === 200 && checkResponse.data.status === true) {
                    if (!checkResponse.data.data.length) {
                        await this.sleep(2000);
                        
                        const bindUrl = 'https://opapi.kiloex.io/tg/referral/bind';
                        const payload = {
                            account: account,
                            code: "i4gr77mh"
                        };
                        
                        const bindResponse = await axios.post(bindUrl, payload, config);
                        
                        if (bindResponse.status === 200 && bindResponse.data.status === true) {
                            this.log('Bind referral code successful', 'success');
                        } else {
                            return { success: false, error: bindResponse.data.msg };
                        }
                    }
                    return { success: true };
                } else {
                    return { success: false, error: checkResponse.data.msg };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    async updateMining(account, stamina, config) {
        return await this.retryWithDelay(async () => {
            const url = 'https://opapi.kiloex.io/tg/mining/update';
            try {
                const response = await axios.post(url, {
                    account: account,
                    stamina: stamina,
                    coin: stamina
                }, config);

                if (response.status === 200 && response.data.status === true) {
                    this.log('Mining successful', 'success');
                    return { success: true };
                } else {
                    return { success: false, error: response.data.msg };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    async openOrder(account, positionType, config) {
        return await this.retryWithDelay(async () => {
            const url = 'https://opapi.kiloex.io/tg/order/open';
            try {
                const payload = {
                    account: account,
                    productId: 2,
                    margin: 10,
                    leverage: 100,
                    positionType: positionType,
                    settleDelay: 300
                };

                const response = await axios.post(url, payload, config);
                if (response.status === 200 && response.data.status === true) {
                    this.log(`Opened ${positionType} order successfully`, 'success');
                    return { success: true };
                } else {
                    return { success: false, error: response.data.msg };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    async processAccount(account, name, index) {
        try {
            let proxyIP = "no proxy";
            const axiosConfig = this.getAxiosConfigWithProxy(index);
            
            if (this.proxies[index]) {
                try {
                    proxyIP = await this.checkProxyIP(this.proxies[index]);
                } catch (error) {
                    this.log(`Error checking proxy IP: ${error.message}`, 'warning');
                }
            }
            
            console.log(`========== Account ${index + 1} | ${name.green} | IP: ${proxyIP} ==========`);

            const userInfo = await this.getUserInfo(account, name, axiosConfig);
            if (!userInfo.success) {
                this.log(`Unable to retrieve account information: ${userInfo.error}`, 'error');
                return;
            }

            this.log(`Balance: ${userInfo.data.balance}`, 'custom');
            this.log(`Stamina: ${userInfo.data.stamina}`, 'custom');

            await this.sleep(2000);
            const referralResult = await this.checkAndBindReferral(account, axiosConfig);
            if (!referralResult.success) {
                this.log(`Error checking/binding referral: ${referralResult.error}`, 'error');
            }

            if (userInfo.data.stamina > 0) {
                await this.sleep(2000);
                const miningResult = await this.updateMining(account, userInfo.data.stamina, axiosConfig);
                if (!miningResult.success) {
                    this.log(`Mining error: ${miningResult.error}`, 'error');
                }
            }

            if (userInfo.data.balance >= 20) {
                this.log('Balance sufficient to open order, starting to open order...', 'info');
                
                await this.sleep(2000);
                const longResult = await this.openOrder(account, 'long', axiosConfig);
                if (!longResult.success) {
                    this.log(`Error opening long order: ${longResult.error}`, 'error');
                }

                await this.sleep(2000);
                const shortResult = await this.openOrder(account, 'short', axiosConfig);
                if (!shortResult.success) {
                    this.log(`Error opening short order: ${shortResult.error}`, 'error');
                }

                if (longResult.success && shortResult.success) {
                    this.log('Both orders opened successfully', 'success');
                }
            }

        } catch (error) {
            this.log(`Error processing account ${account}: ${error.message}`, 'error');
        }
    }

    async main() {
        printLogo();
        try {
            const dataFile = path.join(__dirname, 'data.txt');
            if (!fs.existsSync(dataFile)) {
                this.log('data.txt file not found', 'error');
                return;
            }

            const data = fs.readFileSync(dataFile, 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean)
                .map(line => line.trim())
                .filter(line => line.includes('|'));

            if (data.length === 0) {
                this.log('No account data in data.txt file', 'error');
                return;
            }

            while (true) {
                for (let i = 0; i < data.length; i++) {
                    const [account, name] = data[i].split('|');
                    if (!account || !name) {
                        this.log(`Invalid data line: ${data[i]}`, 'error');
                        continue;
                    }

                    await this.processAccount(account.trim(), name.trim(), i);

                    if (i < data.length - 1) {
                        await this.sleep(3000);
                    }
                }

                this.log('Cycle completed, waiting for the next cycle...', 'success');
                await this.countdown(60 * 60);
            }
        } catch (error) {
            this.log(`Program error: ${error.message}`, 'error');
            throw error;
        }
    }
}

const client = new KiloexAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
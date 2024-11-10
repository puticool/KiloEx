const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const headers = require("./src/header").default;
const printLogo = require("./src/logo");
const log = require('./src/logger');

class KiloexAPIClient {
    constructor() {
        this.headers = headers;
        this.log = log;
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
                    this.log(`Waiting ${delay/1000}s before retrying...`, 'warning');
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

    async getUserInfo(account, name) {
        return await this.retryWithDelay(async () => {
            const url = `https://opapi.kiloex.io/tg/user/info?account=${account}&name=${name}&from=kiloextrade`;
            try {
                const response = await axios.get(url, { headers: this.headers });
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

    async checkAndBindReferral(account) {
        return await this.retryWithDelay(async () => {
            const checkUrl = `https://opapi.kiloex.io/tg/referral/code?account=${account}`;
            try {
                const checkResponse = await axios.get(checkUrl, { headers: this.headers });
                
                if (checkResponse.status === 200 && checkResponse.data.status === true) {
                    if (!checkResponse.data.data.length) {
                        await this.sleep(2000);
                        
                        const bindUrl = 'https://opapi.kiloex.io/tg/referral/bind';
                        const payload = {
                            account: account,
                            code: "i4gr77mh"
                        };
                        
                        const bindResponse = await axios.post(bindUrl, payload, { headers: this.headers });
                        
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

    async updateMining(account, stamina) {
        return await this.retryWithDelay(async () => {
            const url = 'https://opapi.kiloex.io/tg/mining/update';
            try {
                const response = await axios.post(url, {
                    account: account,
                    stamina: stamina,
                    coin: stamina
                }, { headers: this.headers });

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

    async openOrder(account, positionType) {
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

                const response = await axios.post(url, payload, { headers: this.headers });
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
            console.log(`========== Account ${index + 1} | ${name.green} ==========`);

            const userInfo = await this.getUserInfo(account, name);
            if (!userInfo.success) {
                this.log(`Unable to retrieve account information: ${userInfo.error}`, 'error');
                return;
            }

            this.log(`Balance: ${userInfo.data.balance}`, 'custom');
            this.log(`Stamina: ${userInfo.data.stamina}`, 'custom');

            await this.sleep(2000);
            const referralResult = await this.checkAndBindReferral(account);
            if (!referralResult.success) {
                this.log(`Error checking/binding referral: ${referralResult.error}`, 'error');
            }

            if (userInfo.data.stamina > 0) {
                await this.sleep(2000);
                const miningResult = await this.updateMining(account, userInfo.data.stamina);
                if (!miningResult.success) {
                    this.log(`Mining error: ${miningResult.error}`, 'error');
                }
            }

            if (userInfo.data.balance >= 20) {
                this.log('Balance sufficient to open order, starting to open order...', 'info');

                await this.sleep(2000);
                const longResult = await this.openOrder(account, 'long');
                if (!longResult.success) {
                    this.log(`Error opening long order: ${longResult.error}`, 'error');
                }

                await this.sleep(2000);
                const shortResult = await this.openOrder(account, 'short');
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
            this.log(`Lỗi chương trình: ${error.message}`, 'error');
            throw error;
        }
    }
}

const client = new KiloexAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
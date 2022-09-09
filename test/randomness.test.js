const { EtherscanProvider } = require("@ethersproject/providers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Weak Randomness", function () {
    let deployer, attacker, user;

    beforeEach(async function () {
        [deployer, attacker, user] = await ethers.getSigners();

        const Lottery = await ethers.getContractFactory("Lottery", deployer);
        this.lottery = await Lottery.deploy();

        const LotteryAttacker = await ethers.getContractFactory("LotteryAttacker", deployer);
        this.lotteryAttacker = await LotteryAttacker.deploy(this.lottery.address);
    });

    describe("Lottery", function () {
        describe("With bets open", function () {
            it("Should allow user to place a bet", async function () {
                await this.lottery.placeBet(5, { value: ethers.utils.parseEther("10") });
                expect(await this.lottery.bets(deployer.address)).to.eq(5);
            });
            it("Should revert if a user place more than 1 bet", async function () {
                await this.lottery.placeBet(5, { value: ethers.utils.parseEther("10") });
                await expect(this.lottery.placeBet(150, { value: ethers.utils.parseEther("10") })).to.be.revertedWith("Only one bet per player")
            });
            it("Should revert if bet is != 10 eth", async function () {
                await expect(this.lottery.placeBet(150, { value: ethers.utils.parseEther("9") })).to.be.revertedWith("Bet cost: 10 ethers")
                await expect(this.lottery.placeBet(150, { value: ethers.utils.parseEther("11") })).to.be.revertedWith("Bet cost: 10 ethers")
            });
            it("Should revert if bet number is not > 0", async function () {
                await expect(this.lottery.placeBet(0, { value: ethers.utils.parseEther("10") })).to.be.revertedWith("Must be a number from 1 to 255")
            });
        });
        describe("With bets closed", function () {
            it("Should rever if user place a bet", async function () {
                await this.lottery.endLottery();
                await expect(this.lottery.placeBet(150, { value: ethers.utils.parseEther("10") })).to.be.revertedWith("Bets are closed")
            });
            it("Should allow only the winner to call withdrawPrice(", async function () {
                await this.lottery.connect(user).placeBet(5, { value: ethers.utils.parseEther("10") });
                await this.lottery.connect(attacker).placeBet(150, { value: ethers.utils.parseEther("10") });
                await this.lottery.placeBet(17, { value: ethers.utils.parseEther("10") });

                let winningNumber = 0;

                while (winningNumber != 5) {
                    await this.lottery.endLottery();
                    winningNumber = await this.lottery.winningNumber();
                    console.log(winningNumber);
                }

                await expect(this.lottery.connect(attacker).withdrawPrize()).to.be.revertedWith("You are not a winner");

                const userInitialBalance = await ethers.provider.getBalance(user.address);
                await this.lottery.connect(user).withdrawPrize();
                const userFinalBalance = await ethers.provider.getBalance(user.address);

                expect(userFinalBalance).to.be.gt(userInitialBalance);
            });
        });
        describe("Attack", function () {
            it("A miner could tamper the results", async function () {
                await this.lottery.connect(attacker).placeBet(5, { value: ethers.utils.parseEther("10") });
                await this.lottery.connect(user).placeBet(150, { value: ethers.utils.parseEther("10") });
                await this.lottery.placeBet(73, { value: ethers.utils.parseEther("10") });

                //await ethers.provider.send("evm_setNextBlockTimestamp", [1649076691]);

                let winningNumber = 0;

                while (winningNumber != 5) {
                    await this.lottery.endLottery();
                    winningNumber = await this.lottery.winningNumber();
                    console.log(winningNumber);
                }

                console.log(await ethers.provider.getBlock("latest"));
            });
            it("Replicate random logic within the same block", async function () {
                await this.lotteryAttacker.attack({ value: ethers.utils.parseEther("10") });
                await this.lottery.endLottery();
                await ethers.provider.send("evm_mine");

                console.log("Attacker number: " + (await this.lottery.bets(this.lotteryAttacker.address)));
                console.log("Winning number: " + (await this.lottery.winningNumber()));
            });
        });
    });
})
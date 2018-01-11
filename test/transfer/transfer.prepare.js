const assert = require('assert');
const chai = require('chai');
const expect = chai.expect;
const transfer = require('../../lib/transfer');

const ONE_SETTLEMENT = "USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9U";
const TWO_SETTLEMENT = "USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9U";
const THREE_SETTLEMENT = "USERTHREE9ADDRESS9USERTHREE9ADDRESS9USERTHREE9ADDRESS9USERTHREE9ADDRESS9USERTHR";

describe('transfer', function () {

    describe('prepare', function () {
        it('should add collateral to transfer value with TWO parties', function () {

            const settlements = [ONE_SETTLEMENT, TWO_SETTLEMENT];
            const deposits = [1000, 1000];
            const transfers = [{
                value: 200,
                address: TWO_SETTLEMENT
            }];

            // execute function under test
            const preparedTransfers = transfer.prepare(settlements, deposits, 0, transfers);

            assert.equal(preparedTransfers.length, 1);
            assert.equal(preparedTransfers[0].value, 400);
        });

        it('should add collateral to transfer value with THREE parties', function () {

            const settlements = [ONE_SETTLEMENT, TWO_SETTLEMENT, THREE_SETTLEMENT];
            const deposits = [1000, 1000, 1000];
            const transfers = [{
                value: 200,
                address: TWO_SETTLEMENT
            }];

            // execute function under test
            const preparedTransfers = transfer.prepare(settlements, deposits, 0, transfers);

            assert.equal(preparedTransfers.length, 2);
            assert.equal(preparedTransfers.find(tx => tx.address === TWO_SETTLEMENT).value, 300);
            assert.equal(preparedTransfers.find(tx => tx.address === THREE_SETTLEMENT).value, 100);
        });

        it('should NOT add collateral to transfer value with TWO parties', function () {

            const settlements = [ONE_SETTLEMENT, TWO_SETTLEMENT];
            const deposits = [1000, 0];
            const transfers = [{
                value: 200,
                address: TWO_SETTLEMENT
            }];

            // execute function under test
            const preparedTransfers = transfer.prepare(settlements, deposits, 0, transfers);

            assert.equal(preparedTransfers.length, 1);
            assert.equal(preparedTransfers[0].address, TWO_SETTLEMENT);
            assert.equal(preparedTransfers[0].value, 200);
        });

        it('should NOT add collateral to transfer value with THREE parties', function () {

            const settlements = [ONE_SETTLEMENT, TWO_SETTLEMENT, THREE_SETTLEMENT];
            const deposits = [1000, 0, 0];
            const transfers = [{
                value: 200,
                address: TWO_SETTLEMENT
            }];

            // execute function under test
            const preparedTransfers = transfer.prepare(settlements, deposits, 0, transfers);

            assert.equal(preparedTransfers.length, 1);
            assert.equal(preparedTransfers.find(tx => tx.address === TWO_SETTLEMENT).value, 200);
        });

        it('should throw an error if insufficient funds', function () {

            const settlements = [ONE_SETTLEMENT, TWO_SETTLEMENT];
            const deposits = [0, 1000];
            const transfers = [{
                value: 200,
                address: TWO_SETTLEMENT
            }];

            // execute function under test
            expect(() => transfer.prepare(settlements, deposits, 0, transfers))
                .to.throw(Error, transfer.TransferErrors.INSUFFICIENT_FUNDS.toString());
        });
    });
});
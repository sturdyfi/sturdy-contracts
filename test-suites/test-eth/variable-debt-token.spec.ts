import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ProtocolErrors, TokenContractId, eContractid } from '../../helpers/types';
import { getVariableDebtToken } from '../../helpers/contracts-getters';

makeSuite('Variable debt token tests', (testEnv: TestEnv) => {
  const { CT_CALLER_MUST_BE_LENDING_POOL } = ProtocolErrors;

  it('Tries to invoke mint not being the LendingPool', async () => {
    const { deployer, pool, weth, helpersContract } = testEnv;

    const wethVariableDebtTokenAddress = (
      await helpersContract.getReserveTokensAddresses(weth.address)
    ).variableDebtTokenAddress;

    const variableDebtContract = await getVariableDebtToken(wethVariableDebtTokenAddress);

    await expect(
      variableDebtContract.mint(deployer.address, deployer.address, '1', '1')
    ).to.be.revertedWith(CT_CALLER_MUST_BE_LENDING_POOL);
  });

  it('Tries to invoke burn not being the LendingPool', async () => {
    const { deployer, pool, weth, helpersContract } = testEnv;

    const wethVariableDebtTokenAddress = (
      await helpersContract.getReserveTokensAddresses(weth.address)
    ).variableDebtTokenAddress;

    const variableDebtContract = await getVariableDebtToken(wethVariableDebtTokenAddress);

    await expect(variableDebtContract.burn(deployer.address, '1', '1')).to.be.revertedWith(
      CT_CALLER_MUST_BE_LENDING_POOL
    );
  });
});

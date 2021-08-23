require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const { writeFileSync, appendFileSync, readFileSync } = require('fs');

const date = new Date();
const fileNameByDate = `${date.getFullYear()}-${(date.getUTCMonth() + 1)}-${date.getDay()}-${date.getTime()}`;
const downloadPath = './downloads/';
const outputsPath = './outputs/';

const saveLog = (data, error) => {
  appendFileSync(
    `${outputsPath}/error-${fileNameByDate}.log`,
    `\n[${(new Date).toString()}] - [${(error ? 'ERROR' : 'INFO')}] - ${data}`
  );

  console.log('\nError to proccess: ', data);
}

const getBills = async () => {
  console.log('Start get bills...');
  const urlEnergisa = process.env.ENERGISA_URL;
  const urlAccessBills = `${urlEnergisa}${process.env.ENERGISA_CONTAS_URL}`;
  const cpfUser = process.env.ENERGISA_CPF;
  const passwordUser = process.env.ENERGISA_SENHA;
  const noPaids = process.env.SOMENTE_CONTA_NAO_PAGA === 'true';
  const downloadBills = process.env.BAIXAR_CONTAS === 'true';
  const states = JSON.parse(readFileSync('./estados.json'));
  const state = (process.env.ENERGISA_SIGLA_ESTADO || 'SE').toUpperCase();
  let stateName = states.filter((item) => item.sigla === state);
  
  if (stateName.length === 0) {
    saveLog('Estado não encontrado', true)
    return false;
  }
  
  stateName = stateName[0].estado;
  const city = (process.env.ENERGISA_CIDADE || 'ARACAJU').toUpperCase();
  
  console.log('State ok. Now let\'s check the city.');

  try {
    const getStateData = await axios.get(`${urlEnergisa}/EstadoCidade.local?siglaEstado=${state}`);
    let codCity = getStateData.data.filter((item) => item.nomeMun.toUpperCase() === city);
  
    if (codCity.length === 0) {
      saveLog('Cidade não encontrada', true)
      return false;
    }
    
    const codEmpresa = codCity[0].codEmpresa;
    codCity = codCity[0].codMun;
    
    console.log('City ok. Now the accounts for the state and city informed will be searched');

    const cookies = [
      {name: 'PrimeiroAcessoAgenciaVirtual', value: '-742921789.1.0'},
      {name: 'CodEmpresa', value: codEmpresa.toString()},
      {
        name: 'MeuLocal',
        value: `MeuEstadoExtenso=${stateName}&MinhaCidade=${city}`
        + `&MinhaCidadeID=${codCity}&MeuEstadoSigla=${state}&MeuCodEmpresa=${codEmpresa}`
      },
    ];
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(urlEnergisa);
    await page.setCookie(...cookies);
    await page.reload();
    const selectorParent = '.formulario-login';
    
    console.log('Logging in...')

    await page.waitForSelector(selectorParent);
    await page.$eval(`${selectorParent} .campo-form.cpf input`, (el, cpfUser) => el.value = cpfUser, cpfUser);
    await page.$eval(`${selectorParent} .campo-form.senha input`, (el, passwordUser) => el.value = passwordUser, passwordUser);
  
    await page.click(`${selectorParent} a.botao`);
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('Logging in ok. Now let\'s get the bills');

    await page.goto(`${urlAccessBills}/extrato-e-2via-da-conta.aspx`);
    
    console.log('Search bills...');

    const bills = await page.evaluate(async ({noPaids, downloadBills}) => {
      const onlyNoPaids = noPaids || false;
      const tables = document.querySelectorAll('div.tabela-imoveis table');
  
      if (tables.length < 2) {
        return false;
      }
  
      const tableBills = tables[1];
      const tableBody = tableBills.querySelectorAll('tbody tr');
      let dataReturn = [];
  
      for (let item of tableBody) {
        const status = item.querySelector('td:nth-child(6)').innerText?.toUpperCase();
        if (
          (onlyNoPaids && status !== 'PAGO')
          || (!onlyNoPaids)
        ) {
          const month = item.querySelector('td:first-child').innerText?.toUpperCase();
          const year = item.querySelector('td:nth-child(2)').innerText;
          const location = window.location.href.replace('extrato-e-2via-da-conta.aspx', '');
          const downloadLink = `${location}/${item.querySelector('td:nth-child(8) a').getAttribute('href')}`;

          const billData = {
            month,
            year,
            value: item.querySelector('td:nth-child(4)').innerText,
            dueDate: item.querySelector('td:nth-child(5)').innerText,
            status,
            barCode: item.querySelector('td:nth-child(7) a').getAttribute('codigo-barras'),
            downloadLink: downloadLink,
          };

          if (downloadBills) {
            const dataDownload = await fetch(downloadLink);
            const blobDownload = await dataDownload.blob();
    
            const blobUrl = async (blob) => {
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result;
          
                    resolve(dataUrl);
                };
                reader.readAsDataURL(blob);
              })
            }
    
            const downloadBase64 = await blobUrl(blobDownload);
            billData.billBase64 = downloadBase64;
          }
          
          dataReturn.push(billData);
        }
      }
  
      return dataReturn;
    }, { noPaids, downloadBills })
  
    console.log(`Searchs bill completed. Found ${bills.length} bill(s)`);
  
    appendFileSync(
      `${outputsPath}/output-${fileNameByDate}.json`,
      `\n${JSON.stringify(bills, null, 2)}`
    );
    
    if (downloadBills) {
      console.log('Saving the bills in pdf...');
      await Promise.all(
        bills.map(async (bill, index) => {
          if (bill.billBase64) {
            const base64Value = bill.billBase64.split(';base64,').pop();
            writeFileSync(
              `${downloadPath}/bill-${index + 1}-${fileNameByDate}.pdf`,
              base64Value,
              { encoding: 'base64' }
            );

            console.log(`Bill ${(index + 1)} saved!`);
          }
    
          return true;
        })
      );
    }
  
    console.log('Finished!')
  
    await browser.close();
  
    return bills;
  } catch (err) {
    saveLog(err.toString(), true);
  
    return false;
  }
};

if (require.main === module) {
  return getBills().catch(err => console.log(err));
}

module.exports = getBills;
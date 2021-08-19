require('dotenv').config();
const puppeteer = require('puppeteer');
const { writeFileSync, appendFileSync } = require('fs');

(async () => {
  const url = process.env.ENERGISA_URL;
  const urlAccessBills = `${url}${process.env.ENERGISA_CONTAS_URL}`;
  const downloadPath = './downloads/';
  const outputsPath = './outputs/';
  const cookies = [
    {name: 'PrimeiroAcessoAgenciaVirtual', value: '-742921789.1.0'},
    {name: 'CodEmpresa', value: process.env.ENERGISA_COD_EMPRESA},
    {name: 'MeuLocal', value: process.env.ENERGISA_MEU_LOCAL_COOKIE},
  ];
  const cpfUser = process.env.ENERGISA_CPF;
  const passwordUser = process.env.ENERGISA_SENHA;
  const noPaids = process.env.SOMENTE_CONTA_NAO_PAGA === 'true';
  
  const date = new Date();
  const fileNameByDate = `${date.getFullYear()}-${(date.getUTCMonth() + 1)}-${date.getDay()}`;
  
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.setCookie(...cookies);
    await page.reload();
    const selectorParent = '.formulario-login';
    
    await page.waitForSelector(selectorParent);
    await page.$eval(`${selectorParent} .campo-form.cpf input`, (el, cpfUser) => el.value = cpfUser, cpfUser);
    await page.$eval(`${selectorParent} .campo-form.senha input`, (el, passwordUser) => el.value = passwordUser, passwordUser);

    await page.click(`${selectorParent} a.botao`);
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.goto(`${urlAccessBills}/extrato-e-2via-da-conta.aspx`);
    
    const bills = await page.evaluate(async (noPaids) => {
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

          dataReturn.push({
            billBase64: downloadBase64,
            month,
            year,
            value: item.querySelector('td:nth-child(4)').innerText,
            dueDate: item.querySelector('td:nth-child(5)').innerText,
            status,
            barCode: item.querySelector('td:nth-child(7) a').getAttribute('codigo-barras'),
            downloadLink: downloadLink,
          });
        }
      }

      return dataReturn;
    }, noPaids)

    console.log(`Searchs bill completed. Found ${bills.length} bill(s)`);

    appendFileSync(`${outputsPath}/output-${fileNameByDate}.json`, '\n' + JSON.stringify(bills, null, 2));

    await Promise.all(
      bills.map(async (bill, index) => {
        if (bill.billBase64) {
          const base64Value = bill.billBase64.split(';base64,').pop();
          writeFileSync(`${downloadPath}/bill-${index + 1}-${fileNameByDate}.pdf`, base64Value, {encoding: 'base64'});
        }

        return true;
      })
    )

    console.log('Finished!')

    await browser.close();
  } catch (err) {
    appendFileSync(`${outputsPath}/error-${fileNameByDate}.log`, `\n[${(new Date).toString()}] - ${err.toString()}`);
    console.log('Error to proccess', err);

    return false;
  }
})();
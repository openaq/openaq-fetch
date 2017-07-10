'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import { default as moment } from 'moment-timezone';
import cheerio from 'cheerio';
import { parallel } from 'async';
import { convertUnits } from '../lib/utils';
import { default as parse } from 'csv-parse/lib/sync';

exports.name = 'israel';

exports.fetchData = (source, cb) => {}

function getStationTable(ST_ID, startTime, endTime) {
  const url = 'http://www.svivaaqm.net/StationReportFast.aspx?ST_ID=' + ST_ID
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Content-Type': 'text/html; charset=utf-8'
  };
  const form = {
    __VIEWSTATE: "/wEPDwUJLTI1ODExMjExD2QWBAIBD2QWAgIBDxYCHgRocmVmBQ9Bcm1TdHlsZVJUTC5jc3NkAgMPZBYEAgMPDxYCHgRUZXh0BQ/Xk9eV15cg16rXl9eg15RkZAIFD2QWIAIBD2QWAmYPZBYGAgEPDxYCHwEFE9eS15zXmdecINee16LXqNeR15lkZAIDDxAPFgIfAQUZ15vXnCDXlNee15XXoNeZ15jXldeo15nXnRYCHgdvbmNsaWNrBSBDaGVja0FsbCgnbHN0TW9uaXRvcnMnLCdjaGtBbGwnKWRkZAIFDxQrAAMPFgIeDFNlbGVjdGVkTm9kZWRkPCsAEwQAFgYeD0NvbXBvbmVudFRhcmdldAspqAFJbmZyYWdpc3RpY3MuV2ViVUkuVWx0cmFXZWJOYXZpZ2F0b3IuQ29tcG9uZW50VGFyZ2V0LCBJbmZyYWdpc3RpY3MyLldlYlVJLlVsdHJhV2ViTmF2aWdhdG9yLnY3LjEsIFZlcnNpb249Ny4xLjIwMDcxLjQwLCBDdWx0dXJlPW5ldXRyYWwsIFB1YmxpY0tleVRva2VuPTdkZDVjMzE2M2YyY2QwY2IAHhREZWZhdWx0U2VsZWN0ZWRJbWFnZQUXaWdfdHJlZU9mZmljZUZvbGRlci5naWYeCkpTRmlsZU5hbWVlBRYNPCsABgEAFgYeBHRleHQFA1NPMh4DdGFnAgEeB3Rvb2x0aXAFHNeS15XXpNeo15nXqiDXk9eVINeX157Xpteg15k8KwAGAQAWBh8HBQJObx8IAgIfCQUY15fXoNen158g15fXkyDXl9ee16bXoNeZPCsABgEAFgYfBwUDTm94HwgCAx8JBRfXqteX157Xldem15XXqiDXl9eg16fXnzwrAAYBABYGHwcFA05vMh8IAgQfCQUY15fXoNen158g15PXlSDXl9ee16bXoNeZPCsABgEAFgYfBwUCTzMfCAIFHwkFCteQ15XXlteV1588KwAGAQAWBh8HBQJXUx8IAgcfCQUT157XlNeZ16jXldeqINeo15XXlzwrAAYBABYGHwcFAldEHwgCCB8JBQ/Xm9eV15XXnyDXqNeV15c8KwAGAQAWBh8HBQNHU1IfCAIJHwkFEden16jXmdeg16og16nXntepPCsABgEAFgYfBwUEUmFpbh8IAgofCQUG15LXqdedPCsABgEAFgYfBwUEUE0xMB8IAgwfCQU215fXnNen15nXp9eZ150g16DXqdeZ157XmdedINeR15LXldeT15wgMTAg157Xmden16jXldefPCsABgEAFgYfBwUEVGVtcB8IAg0fCQUQ15jXntek16jXmNeV16jXlDwrAAYBABYGHwcFAlJIHwgCDh8JBRHXnNeX15XXqiDXkNeV15nXqDwrAAYBABYGHwcFBFN0V2QfCAIPHwkFLNeh15jXmdeZ16og15TXqten158g16nXnCDXm9eZ15XXldefINeU16jXldeXBhYACRYEHglGb3JlQ29sb3IKXx4EXyFTQgIEZGQCAw8QD2QWAh8CBRBFbmFibGVDb250cm9scygpDxYCZgIBFgIFCNeY15HXnNeUBQbXkteo16NkZAIFDxAPZBYCHwIFEEVuYWJsZUNvbnRyb2xzKCkPFgVmAgECAgIDAgQWBQUI15nXldee15kFCtep15HXldei15kFCteX15XXk9ep15kFCteq16fXldek15QFDtec15DXl9eo15XXoNeUZGQCBw8PFgIfAQUV16rXkNeo15nXmiDXlNeq15fXnNeUZGQCCQ8PFgIeDFNlbGVjdGVkRGF0ZQYQWfCw8cbUiGRkAgsPDxYCHwEFEdep16LXqiDXlNeq15fXnNeUZGQCDQ8PFgIeAUUFETIwMTctNy0xMC0wLTAtMC0wZGQCDw8PFgIfAQUT16rXkNeo15nXmiDXodeZ15XXnWRkAhEPDxYCHwwGEBla27rH1IhkZAITDw8WAh8BBQ/Xqdei16og16HXmdeV151kZAIVDw8WAh8NBREyMDE3LTctMTAtMC0wLTAtMGRkAhcPDxYCHwEFBteh15XXkmRkAhkPEA8WAh4LXyFEYXRhQm91bmRnZBAVCQNBVkcDTWluA01heApSdW5uaW5nQXZnClJ1bm5pbmdNaW4KUnVubmluZ01heA5SdW5uaW5nRm9yd2FyZBFSdW5uaW5nTWluRm9yd2FyZBFSdW5uaW5nTWF4Rm9yd2FyZBUJA0FWRwNNaW4DTWF4ClJ1bm5pbmdBdmcKUnVubmluZ01pbgpSdW5uaW5nTWF4DlJ1bm5pbmdGb3J3YXJkEVJ1bm5pbmdNaW5Gb3J3YXJkEVJ1bm5pbmdNYXhGb3J3YXJkFCsDCWdnZ2dnZ2dnZ2RkAhsPDxYCHwEFD9eR16HXmdehINeW157Xn2RkAh0PZBYCZg9kFgICAQ8QDxYGHg1EYXRhVGV4dEZpZWxkBQhUaW1lQmFzZR4ORGF0YVZhbHVlRmllbGQFAklEHw5nZBAVDAk1IE1pbnV0ZXMKMTAgTWludXRlcwoxNSBNaW51dGVzCjMwIE1pbnV0ZXMGMSBIb3VyBzMgSG91cnMHNCBIb3Vycwc2IEhvdXJzBzggSG91cnMIMTIgSG91cnMIMjQgSG91cnMINDggSG91cnMVDAE1AjEwAjE1AjMwAjYwAzE4MAMyNDADMzYwAzQ4MAM3MjAEMTQ0MAQyODgwFCsDDGdnZ2dnZ2dnZ2dnZ2RkAiEPDxYCHwEFDdeU16bXkiDXk9eV15cWAh8CBRJyZXR1cm4gVmFsaWRGb3JtKClkGAEFHl9fQ29udHJvbHNSZXF1aXJlUG9zdEJhY2tLZXlfXxYGBQZjaGtBbGwFC2xzdE1vbml0b3JzBQx0eHRTdGFydFRpbWUFCnR4dEVuZFRpbWUFEEJhc2ljRGF0ZVBpY2tlcjEFEEJhc2ljRGF0ZVBpY2tlcjLzceB/WbsHlVPonqWplhn2v60NpaY3rzw3JRyPwwL9Og==",
    __VIEWSTATEGENERATOR: '2BFD0E42',
    BasicDatePicker1$TextBox: '',
    BasicDatePicker2$TextBox: '',
    txtStartTime: '09/07/2017' ,
    txtEndTime: '00:00',
    txtStartTime_p: '10/07/2017',
    txtEndTime_p: '00:00',
    ddlAvgType: 'AVG',
    ddlTimeBase: 15,
    btnGenerateReport: 'הצג דוח',
    txtErrorMonitor: 'אנא בחר לפחות מוניטור אחד',
    txtErrorTimeBase: 'בחר בסיס זמן',
    txtError2Y: 'בחר שני מוניטורים'
  };
  request.post({
    url: url,
    headers: headers,
    form: form,
    followAllRedirects: true
  }, (err, body, resp) => {
    console.log(JSON.stringify(resp));
  })
}

getStationTable(11, null, null)

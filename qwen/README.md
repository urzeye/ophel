# qwen 国际版适配

## 用户uid，作为会话cid

cookie里aui，值是87a08aca-f4ba-47e0-85a0-305595bbdae1这样

## 主题切换

local storage里theme: system/light/dark

## 用户token

localstorage里token

## 会话列表

curl '<https://chat.qwen.ai/api/v2/chats/?page=1&exclude_project=true>' \
 -H 'Accept: application/json, text/plain, _/_' \
 -H 'Accept-Language: zh-CN,zh;q=0.9' \
 -H 'Connection: keep-alive' \
 -b '\_gcl_au=1.1.1200932869.1772783249; \_bl_uid=OUmLOmCveRhlv7da8h8Umt22v84U; cna=lHQxIjEEPHACAUowQUiv3o1A; x-ap=cn-hongkong; sca=fb530a37; acw_tc=0a03e59817743265118391486e1466986689835fa0199e069c237ab2310632; cnaui=87a08aca-f4ba-47e0-85a0-305595bbdae1; aui=87a08aca-f4ba-47e0-85a0-305595bbdae1; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijg3YTA4YWNhLWY0YmEtNDdlMC04NWEwLTMwNTU5NWJiZGFlMSIsImxhc3RfcGFzc3dvcmRfY2hhbmdlIjoxNzUwNjYwODczLCJleHAiOjE3NzY5MTkzODR9.TqyAX6SYg_uORFZsXz9-Lodv2iYlvjPQoELHY8solRM; atpsida=2b708579bc9ce04dd6596887_1774327574_20; tfstk=gDbK-CYDsR2HsGa_H2qGrMvf8gVielfUC95jrLvnVOBOF9NEr_tnF4B9IW5HRJWt2QAvFvt7aA_9wBnIO69W10dWBXGQUB_9wQ6uawVePf16GIJ5e_PeNL65eLj3jrfFTU87nUU0o6JTxTcVpL9W17O2OvNMAzgxAEL7n-4MgY2sLU13G2HJf19ww29WVTts5QJ6O4T5Fdt6GIDBPU676dOvgQMWdU9s5BJ6FUT5F1N9ZdOBPU6515draNepBX9oyGsyjgbuKDgE8NdpvL3ui43SzeDDQ6imz47OXHpbod3SPNddsACkfqEkhiJHmLW_S2LR1QBHItajWFtA0_ARpy3B-GsN8ebgHYxpRpKVREh7R1Lppn_dpbgRh1C5mhQgGr8pRpsk8_cYK1QdK67OZbi6Jej9DwLbuv9ljsQJwayzWtCV7Od1hzeC4qQckdcxnKdoA5Ft40-B_nVLzeyz9nZM6KVpJ0oyb5R9n5Ft40-B_Cp09Qnr4hPN.; isg=BBoaraiyJ9dXI6VwXjJ-66vGa8A8S54lO1AsQSSKSK1sl7HRl9pSNAehZ2MLRxa9; ssxmod_itna=1-Qq0xgDRD9QDQi=fKYQiQK077WPi9C0740dGMD3qiQGgSDFqAPeDHKILWSKLDUh5GIxYBa7BGxwK075D/fl7eDZDGKQDqx0Er0/rA2tPlGlj_uhKfjdrqu=7sGGuKh7RIZPeyuHKV1C9Lk5zKxGLDY=DCTA1i7eD44dDt4DIDAYDDxDW04DLDYoDYRT5xGpdMQnrXQRTD0YDzqDg0BmaxGfdL7UKnjxD0u=yfDnKfDGWUeWqwZeQDGUxD6_3UeDMFxGXzDkzxDUjyUxTx=SE=IEYsZaDtqD9fcTe27K=raW5=toe782XiGGrlDvQG3CGsQ5PlwmC0xlqGGIrim4Kh5mv1C2nlPDDct39tbwPVxtKrS7yMUWlIyYD7Nfwd6TbB24GG4YDNQ0YtAGD_iB2ql45DBqQGxbAQLBYlvxeD; ssxmod_itna2=1-Qq0xgDRD9QDQi=fKYQiQK077WPi9C0740dGMD3qiQGgSDFqAPeDHKILWSKLDUh5GIxYBa7BGxwK07eDAKOBxX3wYnGDGaC0M8P53W7DDsR/p=kw2HUFzipn3FstZwBtbHI=\_yHrY5FNu8kUD1MNBf0NeKBfKRfiPg_N2mEre6MNS8W0VSTIjnMNehO2d2buxKducD1r=aY6L/dLHp1nji69//gv08eKSKGHrOwv0ePre/rxyWGUr24x2fDxjG2DBjL_5Sj_KSdkUy_AE5w5SDlR5GKLdqIN9iTI6iBM4adOVU5kiXyRBrGtC0rwxsB0NUq1Pf=Cx7VLrjqW0ENKA7RRbaeOo_rlhYZ3F/qF=\_zlGF1M3=CiAWKd8dk8YHEpVqtjuzKB3nQ=7h12T=MCi7uzOj1rf=T4t9Sb5=NzeE_2O0u7/RvtwWA8rRbYhEQz3LkxLUE4F8GtGd9Q8hhjYiTAgpBdkIZkAOd9QL=4kN0wnZsCEzwEQTuNpx_wOrYSx1deeWWfnOng5BZNk64iPKM3FWkG0AOHUpPbxkpzobRYbxe07bmWArYHOOwPdN7681r5FtViHEK6Yq7Ur60Wthzyg/mqeu_WQULRRODtwUSxgaDvdBwiaSVO6M0kN0DM00Ij5mSjIl5=7rbVDItjLhllOIAyUDKQj9DAoZdLN2sRSrleDA_mDlDZimsGVCm3Ox_35g_ieCAx8D0RbbXxi3B4CDxyPlBVUEqQZU0cYquXr0xVx_0xMp127j=wE7YNhEDt=WWVCqRkOQKCDjzpK7OeK8WkSP6OPkKwg0_3w2DYGrYY/hrBxzGr7xiRK75lhG7YW5XxS42jQjBtvWxeD' \
 -H 'Referer: <https://chat.qwen.ai/c/f15072f7-2959-44f3-99d5-d3bbce080770>' \
 -H 'Sec-Fetch-Dest: empty' \
 -H 'Sec-Fetch-Mode: cors' \
 -H 'Sec-Fetch-Site: same-origin' \
 -H 'Timezone: Tue Mar 24 2026 12:46:20 GMT+0800' \
 -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' \
 -H 'X-Request-Id: 3e52c5a8-e3ca-4bcb-8f8c-dd6d71c45390' \
 -H $'bx-ua: 231\u0021ldk3AkmUe5++jmPBWA7+PukjUqp0h7B0VexF7m2/f1/S2MIhO5riNiekdwI4lfdYzMVILB1aw3EGPSUF3kKmZ8lPiAIfA99wHVkbvhU8JL4SUujyuoG3tL7zcRWMwSS8Q0Lu4Cf8IJvzSt3f4iRIV85u2yL6x9dZwdp2n0NFErq41dR6+zo1kACfonXjylNvAnHkleisRJbsE1LRcYghjCy2KaIY/0UQF02nfrae831/5YCZcSctMI8iGB+Z3ko10Q3oyE+jauHhUYZJYVIGHkE+++3+qCS4+ItUG46tJ8sCo+nHdhogj/Qk1/M8s7POBK4PMuvFBO53oPodAvkA5Z9NVOkUb2yxc0uPcrA+3SznDqKenwzqjpWbqrzbeG76xc9seFYKqQXte2py25XLe454AFsYZa0+Ps42Jk3abpTnMPaHBkyLERgiVBtIn844nPqX/M7TAPQPHr/UMHKoLV5Tt751cJH5ffmwW2FMr8NOK2VbnbX9hSZS5NrS3ZoqVUGUmnpS+lqBfLxcEBGaSJlj6hwknlpneeu//VtZHI+OC0QCp5SWsulGs3lxYrS4ySRN55rWUU/D/caWIiwaUkgARYz4UKNKWE7B3wHde3EYoLVHYVte1nTgQ1Jx6NPvXHnag8dt6m1eYCBzhC941kJtFP0XulJ/neBkU67lGhQnsnW0u0uvrMLRV/ZtDc/2ZqDls0soNQ+xrXDGBR5ObYNngh0GHCjst+oMB5w7GxAto6zx4SwDlogcksmbPgB9AOAKHxXQObHp/P64TeDgacKYN+AiRtw2HilLWWcBnYcxd+MKJk8kiGsM+9uhbqj/Ip0V9y3/fNqpml/d05caxrF9u2e9bQRYMvfVBBG07e+kZVZvwKj8Ia7hOep4wN08kswutuQtyZx/ymBR/xhqQ61u7kjz47soAwg5J72bXDwUtPRwK6Uqkwd9ZFhUY0MQ/IfX2otUd7StbJ5a8PPqiSEv9uD+ZyFm49NpSCDwUghrmD5+kNNJxhrjYXsV19dfoRuorywKE9/J08RDS8SNngiG7fJUw8fJCaWPJU1svl6TaHyQK+IE+P760owpfrgl/vdhnTIWAaEImEGPOfghyUVK6wNyiihv1lOXtCSFYRkavKGpZcG0KO4ysLtFGJizIpprm8ZzBXRy+JNDUJ7sUO29wS4TOGsM01Bi+KpCS9GdrKhKjwtRC2xkhW5R9FW7/CcNL/sB/Bl4/odOLb6rk4o3uYGSrXJHPt/P8dRYNUyW7iJoK/ga6hhE5K53Wc4Zy8lrL1/x5KhxPqP2Cwv5yFyQEEdc71xlVYJWz/rC7HYxK4/fb/DYxktr8+xwhLxQ224aWTZ/uu5CVS5Xl/mET2EAr59u9KGYpR5Sh+Iu0j5af449bKt9xfE9+RXH78AC7oPERHYnT1P+qnYVp4mF0tsf3w0jEWGoertEbpnkvFcl878zTBxPviM9UjQ4aKGXEl1uGYDLryczv3h4opsStX+/AkrbtwTa1Jx2WkKmsqolFIeA25ZqQnlph5MOAcsmL4/eFlSZqt2hPiCylISQSv/Axlcs9jdDDHnLGAn9ByhmPfARboau3cUD1t0MtyEZ4Dds8ec9S4Jaz8Z8OWKzqU8VpwufFI+yZGA6ABKI' \
 -H 'bx-umidtoken: T2gAXmVaQDOcWofUcQNttrhA8te3fctpJ--4dl7RXGCku2kHNlQjPUFi97C5KN4rmL0=' \
 -H 'bx-v: 2.5.36' \
 -H 'sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "Windows"' \
 -H 'source: web'

{
"success": true,
"request_id": "3e52c5a8-e3ca-4bcb-8f8c-dd6d71c45390",
"data": [
{
"id": "f15072f7-2959-44f3-99d5-d3bbce080770",
"title": "多语言文本与格式示例",
"updated_at": 1774327578,
"created_at": 1774327574,
"chat_type": "t2t",
"project_id": "",
"pinned": false
}
]
}

let extensionId = "nofldkhjlencbmokhmnffjocmheoljcn"; //插件id
/**
 * 串口通信
**/
function realodDevices(){
    getDevicesList(
        function(response){
            $('#devices').empty().append('<option value="">选择 USB 通信串口 ( 若无串口请检查并刷新 ) </option>');
            if(response.result === "ok"){
                for(let i = 0; i < response.ports.length; i++){
                    let portStr = response.ports[i].path;
                    if (!portStr.startsWith('COM')){
                        portStr = portStr.split("\\\\\.\\")[1]
                    }
                    $('#devices').append('<option value="' + response.ports[i].path +  '">' + '通信端口' + '( ' + portStr + ' )' + '</option>');
                }
            }
            else{
                alert(response.error);
            }
        }
    );
}

/**
 * 串口显示配置
 * */
function openSelectedPort(){
    serialPort.openPort(
        {
            portName: $('#devices').val(),
            bitrate: 115200,
            dataBits: "eight",
            parityBit: "no",
            stopBits: "two"
        },
        function(response){
            if(response.result === "ok"){
                //Do something
            }
            else{
                alert(response.error);
            }
        }
    );
}

function closeCurrentPort(){
    serialPort.closePort(
        function(response){
            console.log(response);
            if(response.result === "ok"){
                //Do something
            }
            else{
                alert(response.error);
            }
        }
    );
}
/**
* 回显
* */
let response_str = ''; // 回显内容
function onNewData(data){
    let end_flag = "exec(open('code.py').read(),globals())";
    let str;
    str = Utf8ArrayToStr(new Uint8Array(data));
    response_str += str;
    if (response_str.indexOf(end_flag)>=0)
    {
        let format_str = response_str.split(end_flag).slice(-1)[0].replace(/\r/g,"<br/>");
        $('#echo_console').empty().append(format_str);
    }
}

/**
 * 字符串转 16进制  替换成 字节串格式的字符串
 * */
function strFormatCN(str){
    let format = '';
    let pattern = new RegExp("[\u4E00-\u9FA5]+");
    for (let i=0;i<str.length;i++){
        if(pattern.test(str[i])){
            format += encodeURI(str[i]).replace(/%/g,'\\x').toLocaleLowerCase()
        }
        else{
            format += str[i]
        }
    }
    return format;
}
/**
 * Unit8Array 转 utf8 str
 * */
function Utf8ArrayToStr(array) {
    let out,i, c;
    let char2, char3;
    out = "";
    i = 0;
    while(i < array.length) {
        c = array[i++];
        switch(c >> 4) // 右移位运算
        {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
            // 0xxxxxxx
            out += String.fromCharCode(c);
            break;
            case 12: case 13:
            // 110x xxxx   10xx xxxx
            char2 = array[i++];
            out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
            break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0));
                break;
        }
    }

    return out;
}

function sendData(){
    response_str = '';
    $('#echo_console').val()
    let code = $('#generate_code_data').val();
    code = code.replace(/[\r\n]/g,"\\n").replace(/\n/g,'\\n').replace(/\t/g,'\\t'); //去掉回车换行;
    code = strFormatCN(code);
    let mainCode = [
        "f= open('./code.py','wb+',encoding='utf-8')",
    ];
    for(let i =0;i<code.length;i+=100){
        mainCode.push('f.write(b"""'+code.slice(i,i+100)+'""")')
    }
    mainCode.push('f.close()');
    mainCode.push("exec(open('code.py').read(),globals())");
    for (let i = 0; i<mainCode.length;i++){
        setTimeout(() => {
            let input = stringToArrayBuffer(mainCode[i]+'\r');
            serialPort.write(input,
                function(response){
                    // console.log(response);
                }
            );
        }, 100*i);
    }
}

function stringToArrayBuffer(string){
    let buffer = new ArrayBuffer(string.length);
    let dv = new DataView(buffer);
    for(let i = 0; i < string.length; i++){
        dv.setUint8(i, string.charCodeAt(i));
    }
    return dv.buffer;
}

window.onbeforeunload = function(){
    if(serialPort.isOpen()){
        serialPort.closePort(
            function(response){
                console.log(response);
                if(response.result === "ok"){
                    return null;
                }
                else{
                    alert(response.error);
                    return false;
                }
            }
        );
    }
    return null;
};


function SerialPort(){
    let portGUID;//应用分配的端口GUID
    let port = chrome.runtime.connect(extensionId);//初始化与app的通信
    let serialConnectionId;//包含唯一的串行端口连接ID
    let isSerialPortOpen = false;//串行连接是否打开
    let onDataReceivedCallback = undefined;//如果有新数据从串行端口连接传入，则调用回调函数
    let onErrorReceivedCallback = undefined;//如果存在连接，则调用回调函数进行调用
    /**
      *处理来自应用程序的传入消息的侦听器占用了消息传递端口。
      *处理的命令是：
      *-guid->与应用程序建立连接时收到，代表分配给端口的GUID
      *-串行数据->当串行端口上有新的二进制数据时收到
     */
    port.onMessage.addListener(
        function(msg) {
            if(msg.header === "guid"){
                portGUID = msg.guid;
            }
            else if(msg.header === "serialdata"){
                if(onDataReceivedCallback !== undefined){
                    onDataReceivedCallback(new Uint8Array(msg.data).buffer);
                }
            }
            else if(msg.header === "serialerror"){
                onErrorReceivedCallback(msg.error);
            }
        }
    );

    /**
     * 检查当前端口是否打开
     */
    this.isOpen = function(){
        return isSerialPortOpen;
    }

    /**
     * 设置新的数据回调
     */
    this.setOnDataReceivedCallback = function(callBack){
        onDataReceivedCallback = callBack;
    }

    /**
     * 设置错误回调
     */
    this.setOnErrorReceivedCallback = function(callBack){
        onErrorReceivedCallback = callBack;
    }

    /**
      * 尝试打开串行连接。
      * portInfo必须包含：
      * portName->要打开的端口的路径
      * 波特率->端口比特率作为数字
      * dataBits->数据位（“八”或“七”）
      * parityBit->奇偶校验位（“否”，“奇数”或“偶数”）
      * stopBits->停止位（“一个”或“两个”）
      *回调是用于处理应用程序结果的函数。
     */
    this.openPort = function(portInfo, callBack){
        chrome.runtime.sendMessage(extensionId,
            {
                cmd: "open",
                portGUID: portGUID,
                info: portInfo
            },
            function(response){
                if(response.result === "ok"){
                    isSerialPortOpen = true;
                    serialConnectionId = response.connectionInfo.connectionId;
                    $("#devices").attr("disabled",true);
                    $('#btn_refresh').attr("disabled",true);
                    $('#btn_open_port').hide();
                    $('#btn_close_port').show()
                }
                callBack(response);
            }
        );
    }

    /**
      * 尝试关闭串行连接。
      * 回调是用于处理app结果的函数。
     */
    this.closePort = function(callBack){
        chrome.runtime.sendMessage(extensionId,
            {
                cmd: "close",
                connectionId: serialConnectionId
            },
            function(response){
                if(response.result === "ok"){
                    isSerialPortOpen = false;
                    $("#devices").attr("disabled",false);
                    $('#btn_refresh').attr("disabled",false);
                    $('#btn_open_port').show();
                    $('#btn_close_port').hide()
                }
                callBack(response);
            }
        );
    }

    /**
      *	在串口上写数据。
      * 请求中必须包含：
      * connectionId->打开端口时提供的连接唯一ID
      * data->包含要发送的字节的数组
     */
    this.write = function(data, callBack){
        chrome.runtime.sendMessage(extensionId,
            {
                cmd: "write",
                connectionId: serialConnectionId,
                data: Array.prototype.slice.call(new Uint8Array(data))
            },
            function(response){
                if(response.result === "ok"){
                    if(response.sendInfo.error !== undefined){
                        if(response.sendInfo.error === "disconnected" || response.sendInfo.error === "system_error"){
                            isSerialPortOpen = false;
                            closePort(function(){});
                        }
                    }
                }
                callBack(response);
            }
        );
    }
}

/**
  *	获取连接到PC的所有串口设备的列表
 */
function getDevicesList(callBack){
    chrome.runtime.sendMessage(extensionId, {cmd: "list"}, callBack);
}

/**
 * 用于检查浏览器上是否安装了串行接口应用程序。
 * 如果已安装，则返回结果：“确定”和当前版本
 */
function isExtensionInstalled(callback){
    chrome.runtime.sendMessage(extensionId, { cmd: "installed" },
        function (response) {
            if (response){
                callback(true);
            }else{
                callback(false);
            }
        }
    );
}


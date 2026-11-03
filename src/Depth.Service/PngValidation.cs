using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;

namespace Depth;

/// <summary>Validate PNG chunks and decoded scanline structure before staging untrusted generated images.</summary>
public static class PngValidation
{
    static readonly uint[] Table=Enumerable.Range(0,256).Select(i=>{uint c=(uint)i;for(int bit=0;bit<8;bit++)c=(c&1)!=0?0xedb88320u^(c>>1):c>>1;return c;}).ToArray();
    static uint Crc(ReadOnlySpan<byte> bytes){uint c=uint.MaxValue;foreach(byte b in bytes)c=Table[(c^b)&255]^(c>>8);return c^uint.MaxValue;}
    static void Require(bool condition,string message){if(!condition)throw new InvalidOperationException("Invalid generated PNG: "+message);}
    public static void Validate(byte[] data)
    {
        Require(data.Length>=45&&data.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}),"signature or length");
        int offset=8,width=0,height=0,depth=0,color=0,interlace=0;bool header=false,end=false,palette=false,seenData=false,closedData=false;
        using var compressed=new MemoryStream();
        while(offset<data.Length){
            Require(data.Length-offset>=12,"truncated chunk");uint count=BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(offset,4));
            Require(count<=data.Length-offset-12,"chunk length");int length=(int)count;var kind=Encoding.ASCII.GetString(data,offset+4,4);
            Require(Crc(data.AsSpan(offset+4,length+4))==BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(offset+8+length,4)),"chunk checksum");
            var body=data.AsSpan(offset+8,length);Require(header||kind=="IHDR","missing first IHDR");
            if(kind=="IHDR"){
                Require(!header&&length==13,"IHDR layout");header=true;
                uint w=BinaryPrimitives.ReadUInt32BigEndian(body[..4]),h=BinaryPrimitives.ReadUInt32BigEndian(body.Slice(4,4));
                Require(w is >0 and <=8192&&h is >0 and <=8192&&(ulong)w*h<=16777216,"dimensions");width=(int)w;height=(int)h;
                depth=body[8];color=body[9];interlace=body[12];
                Require(body[10]==0&&body[11]==0&&interlace<=1,"compression/filter/interlace");
                Require(color switch{0=>depth is 1 or 2 or 4 or 8 or 16,2 or 4 or 6=>depth is 8 or 16,3=>depth is 1 or 2 or 4 or 8,_=>false},"color type / bit depth");
            }else if(kind=="PLTE"){
                Require(!palette&&!seenData&&color is not (0 or 4)&&length>0&&length%3==0&&length<=768,"palette");palette=true;
                if(color==3)Require(length/3<=1<<depth,"palette exceeds bit depth");
            }else if(kind=="IDAT"){
                Require(!closedData&&(color!=3||palette),"image data order or missing palette");seenData=true;compressed.Write(body);
            }else if(kind=="IEND"){
                Require(length==0&&seenData,"IEND layout");end=true;offset+=12;break;
            }else{
                // Unknown critical chunks cannot safely be interpreted by a PNG decoder.
                Require((data[offset+4]&32)!=0,"unknown critical chunk");if(seenData)closedData=true;
            }
            offset+=length+12;
        }
        Require(end&&offset==data.Length,"missing end or trailing bytes");Require(compressed.Length>=6,"truncated zlib stream");compressed.Position=0;
        uint expectedAdler=BinaryPrimitives.ReadUInt32BigEndian(compressed.GetBuffer().AsSpan((int)compressed.Length-4,4)),a=1,b=0;
        void Adler(byte value){a=(a+value)%65521;b=(b+a)%65521;}
        int channels=color switch{2=>3,4=>2,6=>4,_=>1};var row=new byte[width*channels*depth/8+2];
        try{
            using var decoded=new ZLibStream(compressed,CompressionMode.Decompress);
            void Pass(int x,int y,int dx,int dy){
                int columns=width<=x?0:(width-x+dx-1)/dx,rows=height<=y?0:(height-y+dy-1)/dy;if(columns==0||rows==0)return;
                int bytes=(columns*channels*depth+7)/8;
                for(int line=0;line<rows;line++){
                    int filter=decoded.ReadByte();Require(filter is >=0 and <=4,"invalid or missing row filter");Adler((byte)filter);
                    int read=0;while(read<bytes){int n=decoded.Read(row,read,bytes-read);Require(n>0,"truncated image pixels");read+=n;}
                    for(int i=0;i<bytes;i++)Adler(row[i]);
                }
            }
            if(interlace==0)Pass(0,0,1,1);
            else{Pass(0,0,8,8);Pass(4,0,8,8);Pass(0,4,4,8);Pass(2,0,4,4);Pass(0,2,2,4);Pass(1,0,2,2);Pass(0,1,1,2);}
            Require(decoded.ReadByte()==-1,"unexpected decompressed pixels");
            // ZLibStream can return EOF without rejecting an absent trailer, so verify it explicitly.
            Require(expectedAdler==(b<<16|a),"missing or incorrect zlib checksum");
        }catch(InvalidDataException){throw new InvalidOperationException("Invalid generated PNG: compressed pixels or checksum.");}
    }
}
